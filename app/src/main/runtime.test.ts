import { afterEach, expect, test } from "vitest";
import { chmod, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Selection } from "../formats/types";
import { validateRuntimeFile, validateSocketResponse } from "../formats/validate";
import { answerRequest, parseSocketRequest, runtimeFile, socketResponse, startRuntime, tokenMatches, type Runtime } from "./runtime";

const TOKEN = "a".repeat(64);
const ROOT = "/Users/sam/code/app";
const SELECTION: Selection = {
  root: ROOT,
  canvas: { path: ".doan/canvases/settings.html", id: "settings" },
  frame: { id: "hero" },
  element: { selector: "[data-doan-frame=\"hero\"] > button:nth-of-type(1)", html: "<button>Save</button>", text: "Save" },
};
const request = (token = TOKEN, root = ROOT) => JSON.stringify({ v: 1, token, root });

test("runtimeFile is the runtime.v1 document", () => {
  const file = runtimeFile("/tmp/doan-x/app.sock", TOKEN);
  expect(file).toEqual({ v: 1, socket: "/tmp/doan-x/app.sock", token: TOKEN });
  expect(validateRuntimeFile(file)).toBe(true);
});

test("parseSocketRequest accepts only a schema-valid request object", () => {
  expect(parseSocketRequest(request())).toEqual({ v: 1, token: TOKEN, root: ROOT });
  // A wrong-format token is still a request; the token check answers it.
  expect(parseSocketRequest(request("abc"))).toEqual({ v: 1, token: "abc", root: ROOT });
  for (const line of ["", "{", "null", "[]", "\"x\"", JSON.stringify({ v: 1, root: ROOT }), JSON.stringify({ v: 1, token: TOKEN }),
    JSON.stringify({ v: 2, token: TOKEN, root: ROOT }), JSON.stringify({ v: 1, token: TOKEN, root: ROOT, extra: 1 }), JSON.stringify({ v: 1, token: TOKEN, root: "" })]) {
    expect(parseSocketRequest(line), line).toBeNull();
  }
});

test("tokenMatches compares lengths first and then the bytes", () => {
  expect(tokenMatches(TOKEN, TOKEN)).toBe(true);
  expect(tokenMatches("b".repeat(64), TOKEN)).toBe(false);
  expect(tokenMatches(`${"a".repeat(63)}b`, TOKEN)).toBe(false);
  expect(tokenMatches("a".repeat(63), TOKEN)).toBe(false);
  expect(tokenMatches("a".repeat(65), TOKEN)).toBe(false);
  expect(tokenMatches("", TOKEN)).toBe(false);
  // 32 two-byte characters: as many UTF-16 units as half the token, but 64 bytes.
  expect(tokenMatches("é".repeat(32), TOKEN)).toBe(false);
  expect(tokenMatches("é".repeat(64), TOKEN)).toBe(false);
});

test("socketResponse returns the selection only for the same root", () => {
  const same = socketResponse(SELECTION, ROOT);
  expect(same).toEqual({ v: 1, ok: true, result: { selection: SELECTION } });
  const other = socketResponse(SELECTION, "/Users/sam/code/other");
  expect(other).toEqual({ v: 1, ok: true, result: {} });
  // A prefix of the stored root is another project, not a parent match.
  expect(socketResponse(SELECTION, "/Users/sam/code")).toEqual({ v: 1, ok: true, result: {} });
  expect(socketResponse({ ...SELECTION, root: `${ROOT}/` }, ROOT)).toEqual({ v: 1, ok: true, result: {} });
  const none = socketResponse(null, ROOT);
  expect(none).toEqual({ v: 1, ok: true, result: {} });
  for (const response of [same, other, none]) expect(validateSocketResponse(response)).toBe(true);
});

test("answerRequest checks the request, then the token, then the project", () => {
  const state = { isOpen: (root: string) => root === ROOT, selection: () => SELECTION };
  const code = (line: string) => {
    const response = answerRequest(line, TOKEN, state);
    expect(validateSocketResponse(response), line).toBe(true);
    return response.ok ? "ok" : response.error.code;
  };
  expect(code("not json")).toBe("bad_request");
  expect(code(JSON.stringify({ v: 1, token: "wrong", root: "" }))).toBe("bad_request");
  expect(code(request("0".repeat(64)))).toBe("bad_token");
  expect(code(request("short"))).toBe("bad_token");
  // A closed project is not told apart before the token is checked.
  expect(code(request("short", "/not/open"))).toBe("bad_token");
  expect(code(request(TOKEN, "/not/open"))).toBe("project_not_open");
  expect(answerRequest(request(), TOKEN, state)).toEqual({ v: 1, ok: true, result: { selection: SELECTION } });
});

test("answerRequest leaves out a selection from another open project", () => {
  const other = "/Users/sam/code/other";
  const state = { isOpen: (root: string) => root === ROOT || root === other, selection: () => SELECTION };
  expect(answerRequest(request(TOKEN, other), TOKEN, state)).toEqual({ v: 1, ok: true, result: {} });
  expect(answerRequest(request(), TOKEN, { ...state, selection: () => null })).toEqual({ v: 1, ok: true, result: {} });
});

// Real socket and files: the guarantees are checked as observed state, not as constants (POSTMORTEM 2026-10-21).
let userData: string | undefined;
let runtime: Runtime | undefined;
afterEach(async () => {
  runtime?.disposeSync();
  runtime = undefined;
  if (userData) await rm(userData, { recursive: true, force: true });
  userData = undefined;
});

async function start(selection: Selection | null = SELECTION): Promise<Runtime> {
  userData = await mkdtemp(join(tmpdir(), "doan-runtime-test-"));
  runtime = await startRuntime(userData, { isOpen: (root) => root === ROOT, selection: () => selection });
  return runtime;
}

// Sends raw bytes and collects everything the app writes until it closes.
function exchange(socket: string, data: string | Buffer | null): Promise<{ text: string; ms: number }> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const chunks: Buffer[] = [];
    const client = connect(socket);
    client.on("connect", () => { if (data !== null) client.write(data); });
    client.on("data", (chunk: Buffer) => chunks.push(chunk));
    client.on("error", reject);
    client.on("close", () => resolve({ text: Buffer.concat(chunks).toString("utf8"), ms: Date.now() - started }));
  });
}

async function ask(socket: string, line: string | Buffer): Promise<unknown> {
  const { text } = await exchange(socket, line);
  expect(text.endsWith("\n")).toBe(true);
  expect(text.indexOf("\n")).toBe(text.length - 1);
  const response: unknown = JSON.parse(text);
  expect(validateSocketResponse(response)).toBe(true);
  return response;
}

test("startRuntime writes runtime.json 0600 and a socket in a 0700 temp dir", async () => {
  const started = await start();
  const file = join(userData ?? "", "runtime.json");
  expect(started.file).toBe(file);
  const content: unknown = JSON.parse(await readFile(file, "utf8"));
  expect(validateRuntimeFile(content)).toBe(true);
  expect(content).toEqual({ v: 1, socket: started.socket, token: started.token });
  expect(started.token).toMatch(/^[0-9a-f]{64}$/);
  expect((await stat(file)).mode & 0o777).toBe(0o600);
  const dir = dirname(started.socket);
  expect(dirname(dir)).toBe(tmpdir());
  expect(dir.slice(tmpdir().length + 1)).toMatch(/^doan-/);
  expect((await stat(dir)).mode & 0o777).toBe(0o700);
  expect((await stat(started.socket)).isSocket()).toBe(true);
  // No temp file left beside runtime.json.
  expect(await readdir(userData ?? "")).toEqual(["runtime.json"]);
});

test("each start uses a new token", async () => {
  const first = await start();
  const firstToken = first.token;
  first.disposeSync();
  runtime = undefined;
  await rm(userData ?? "", { recursive: true, force: true });
  const second = await start();
  expect(second.token).not.toBe(firstToken);
});

test("a real round trip answers the selection, and wrong tokens are refused", async () => {
  const { socket, token } = await start();
  expect(await ask(socket, `${request(token)}\n`)).toEqual({ v: 1, ok: true, result: { selection: SELECTION } });
  const sameLength = token.replace(/^./, token.startsWith("0") ? "1" : "0");
  expect(await ask(socket, `${request(sameLength)}\n`)).toMatchObject({ ok: false, error: { code: "bad_token" } });
  expect(await ask(socket, `${request("abc")}\n`)).toMatchObject({ ok: false, error: { code: "bad_token" } });
  expect(await ask(socket, `${request(token, "/not/open")}\n`)).toMatchObject({ ok: false, error: { code: "project_not_open" } });
  expect(await ask(socket, "{broken\n")).toMatchObject({ ok: false, error: { code: "bad_request" } });
});

test("startRuntime replaces an older 0644 runtime.json and a stale temp file", async () => {
  // A file left by another run (another umask, a copy) keeps its mode when
  // written in place; the temp file + rename gives a fresh 0600 file.
  userData = await mkdtemp(join(tmpdir(), "doan-runtime-test-"));
  const file = join(userData, "runtime.json");
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(file, "old");
  await writeFile(temp, "stale");
  // Explicit, so the starting mode does not depend on the umask.
  await chmod(file, 0o644);
  await chmod(temp, 0o644);
  runtime = await startRuntime(userData, { isOpen: () => true, selection: () => null });
  expect((await stat(file)).mode & 0o777).toBe(0o600);
  expect(JSON.parse(await readFile(file, "utf8"))).toEqual(runtimeFile(runtime.socket, runtime.token));
  expect(await readdir(userData)).toEqual(["runtime.json"]);
});

test("only the first line of a connection is answered", async () => {
  const { socket, token } = await start();
  const { text } = await exchange(socket, `${request(token)}\n${request(token)}\n`);
  expect(text.split("\n")).toHaveLength(2);
  expect(JSON.parse(text)).toMatchObject({ ok: true });
});

test("a line split across writes is joined", async () => {
  const { socket, token } = await start();
  const line = `${request(token)}\n`;
  const { text } = await new Promise<{ text: string }>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const client = connect(socket);
    client.on("connect", () => {
      client.write(line.slice(0, 10));
      setTimeout(() => client.write(line.slice(10)), 50);
    });
    client.on("data", (chunk: Buffer) => chunks.push(chunk));
    client.on("error", reject);
    client.on("close", () => resolve({ text: Buffer.concat(chunks).toString("utf8") }));
  });
  expect(JSON.parse(text)).toMatchObject({ ok: true, result: { selection: SELECTION } });
});

test("a 64 KiB line is read and a longer one is refused", async () => {
  const { socket, token } = await start();
  const base = request(token);
  const exact = base + " ".repeat(64 * 1024 - Buffer.byteLength(base));
  expect(Buffer.byteLength(exact)).toBe(64 * 1024);
  expect(await ask(socket, `${exact}\n`)).toMatchObject({ ok: true });
  expect(await ask(socket, `${exact} \n`)).toMatchObject({ ok: false, error: { code: "bad_request" } });
  // Refused without waiting for a newline that may never come.
  const { text, ms } = await exchange(socket, Buffer.alloc(64 * 1024 + 1, 0x20));
  expect(JSON.parse(text)).toMatchObject({ ok: false, error: { code: "bad_request" } });
  expect(ms).toBeLessThan(1500);
});

test("a connection that sends no line is closed after 2 seconds", async () => {
  const { socket } = await start();
  const { text, ms } = await exchange(socket, null);
  expect(text).toBe("");
  expect(ms).toBeGreaterThanOrEqual(1900);
  expect(ms).toBeLessThan(3000);
});

test("a connection that drips bytes is still closed after 2 seconds", async () => {
  const { socket } = await start();
  const { text, ms } = await new Promise<{ text: string; ms: number }>((resolve, reject) => {
    const started = Date.now();
    const chunks: Buffer[] = [];
    const client = connect(socket);
    const drip = setInterval(() => { if (!client.destroyed) client.write(" "); }, 200);
    client.on("data", (chunk: Buffer) => chunks.push(chunk));
    client.on("error", () => undefined);
    client.on("close", () => { clearInterval(drip); resolve({ text: Buffer.concat(chunks).toString("utf8"), ms: Date.now() - started }); });
    setTimeout(() => { clearInterval(drip); reject(new Error("still open")); }, 4000);
  });
  expect(text).toBe("");
  expect(ms).toBeLessThan(3000);
});

test("a peer that keeps its side open after the reply is still cut off after 2 seconds", async () => {
  const { socket, token } = await start();
  // allowHalfOpen: the client never closes its side, as a stuck or hostile peer would.
  const client = connect({ path: socket, allowHalfOpen: true });
  const errors: string[] = [];
  client.on("error", (error: NodeJS.ErrnoException) => errors.push(error.code ?? "error"));
  const reply = await new Promise<string>((resolve) => {
    let text = "";
    client.on("connect", () => client.write(`${request(token)}\n`));
    client.on("data", (chunk: Buffer) => { text += chunk.toString("utf8"); });
    client.on("end", () => resolve(text));
  });
  expect(JSON.parse(reply)).toMatchObject({ ok: true });
  await new Promise((resolve) => setTimeout(resolve, 2300));
  // Writing to a connection the app has fully closed fails; a half-open one would take it.
  client.write("x");
  await new Promise((resolve) => setTimeout(resolve, 200));
  client.destroy();
  expect(errors.length).toBeGreaterThan(0);
});

test("disposeSync removes the socket, its dir and our runtime.json", async () => {
  const started = await start();
  started.disposeSync();
  runtime = undefined;
  expect(existsSync(started.socket)).toBe(false);
  expect(existsSync(dirname(started.socket))).toBe(false);
  expect(existsSync(started.file)).toBe(false);
});

test("disposeSync keeps a runtime.json another instance wrote", async () => {
  const started = await start();
  const other = JSON.stringify(runtimeFile("/tmp/doan-other/app.sock", "b".repeat(64)));
  await writeFile(started.file, other);
  started.disposeSync();
  runtime = undefined;
  expect(await readFile(started.file, "utf8")).toBe(other);
  expect(existsSync(dirname(started.socket))).toBe(false);
});

test("disposeSync tolerates files already gone", async () => {
  const started = await start();
  await rm(started.file);
  await rm(dirname(started.socket), { recursive: true });
  expect(() => started.disposeSync()).not.toThrow();
  runtime = undefined;
});
