import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { join } from "node:path";

// A stand-in for the app's side of `doan active`: runtime.v1 on disk and
// app-socket.v1 on a unix socket, mirroring app/src/main/runtime.ts. The
// validators follow schema/*.schema.json and are tested against its fixtures.

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const only = (v: Obj, keys: string[], required: string[]) => Object.keys(v).every(k => keys.includes(k)) && required.every(k => k in v);
// JSON Schema maxLength counts code points.
const str = (v: unknown, min = 0, max = Infinity) => typeof v === "string" && [...v].length >= min && [...v].length <= max;

export function validRuntimeFile(v: unknown): boolean {
  return isObj(v) && only(v, ["v", "socket", "token"], ["v", "socket", "token"]) && v.v === 1
    && typeof v.socket === "string" && v.socket.startsWith("/") && typeof v.token === "string" && /^[0-9a-f]{64}$/.test(v.token);
}

export function validRequest(v: unknown): boolean {
  return isObj(v) && only(v, ["v", "token", "root"], ["v", "token", "root"]) && v.v === 1 && typeof v.token === "string" && str(v.root, 1);
}

function validElement(v: unknown): boolean {
  return isObj(v) && only(v, ["doanId", "selector", "html", "text", "truncated"], ["selector", "html"])
    && str(v.selector, 0, 1000) && str(v.html, 0, 2000)
    && (!("doanId" in v) || str(v.doanId, 0, 200)) && (!("text" in v) || str(v.text, 0, 500))
    && (!("truncated" in v) || typeof v.truncated === "boolean");
}

export function validSelection(v: unknown): boolean {
  if (!isObj(v) || !only(v, ["root", "canvas", "frame", "element"], ["root", "canvas"]) || !str(v.root, 1)) return false;
  const canvas = v.canvas;
  if (!isObj(canvas) || !only(canvas, ["path", "id"], ["path"]) || !str(canvas.path, 1) || ("id" in canvas && !str(canvas.id, 1))) return false;
  if ("frame" in v) {
    const frame = v.frame;
    if (!isObj(frame) || !only(frame, ["id", "title"], ["id"]) || !str(frame.id, 0, 200) || ("title" in frame && !str(frame.title, 0, 200))) return false;
  }
  return !("element" in v) || validElement(v.element);
}

export function validResponse(v: unknown): boolean {
  if (!isObj(v) || v.v !== 1) return false;
  if (v.ok === true) return only(v, ["v", "ok", "result"], ["v", "ok", "result"]) && isObj(v.result) && only(v.result, ["selection"], [])
    && (!("selection" in v.result) || validSelection(v.result.selection));
  if (v.ok === false) return only(v, ["v", "ok", "error"], ["v", "ok", "error"]) && isObj(v.error) && only(v.error, ["code", "message"], ["code", "message"])
    && ["bad_token", "bad_request", "project_not_open"].includes(v.error.code as string) && typeof v.error.message === "string";
  return false;
}

const error = (code: string, message: string) => ({ v: 1, ok: false, error: { code, message } });

// Same order and messages as the app's answerRequest: shape, then token, then project.
export function answer(line: string, token: string, root: string, selection: Obj | null): Obj {
  let request: unknown;
  try { request = JSON.parse(line); } catch { request = null; }
  if (!validRequest(request)) return error("bad_request", "The request is not an app-socket v1 request.");
  const r = request as { token: string; root: string };
  if (r.token !== token) return error("bad_token", "The token does not match this app.");
  if (r.root !== root) return error("project_not_open", "The project is not open in Doan.");
  return { v: 1, ok: true, result: selection !== null && selection.root === root ? { selection } : {} };
}

export interface FakeApp { runtimePath: string; close(): Promise<void> }
interface FakeAppOptions { dir: string; root: string; selection: Obj | null }

// `dir` must be short: macOS sun_path is 104 bytes.
export async function serveFakeApp(o: FakeAppOptions): Promise<FakeApp> {
  if (o.selection !== null && !validResponse({ v: 1, ok: true, result: { selection: o.selection } })) throw new Error("selection does not match app-socket v1");
  const token = randomBytes(32).toString("hex");
  const socketPath = join(o.dir, "app.sock");
  const runtimePath = join(o.dir, "runtime.json");
  const connections = new Set<Socket>();
  const server = createServer(connection => {
    connections.add(connection);
    connection.on("close", () => connections.delete(connection));
    connection.on("error", () => undefined);
    let buffer = "";
    connection.on("data", chunk => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline !== -1) connection.end(JSON.stringify(answer(buffer.slice(0, newline), token, o.root, o.selection)) + "\n");
    });
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(socketPath, resolve); });
  writeFileSync(runtimePath, JSON.stringify({ v: 1, socket: socketPath, token }), { mode: 0o600 });
  return {
    runtimePath,
    close: () => new Promise(resolve => {
      for (const connection of connections) connection.destroy();
      server.close(() => resolve());
    }),
  };
}

// Checks call the CLI synchronously, which blocks this process's event loop, so
// the app the CLI talks to has to live in another process.
export async function startFakeApp(o: FakeAppOptions): Promise<FakeApp> {
  const child = spawn(process.execPath, [import.meta.filename, JSON.stringify(o)], { stdio: ["pipe", "pipe", "inherit"] });
  await new Promise<void>((resolve, reject) => {
    let out = "";
    child.stdout.on("data", chunk => { out += chunk; if (out.includes("ready\n")) resolve(); });
    child.on("exit", code => reject(new Error(`fake app exited (${code}) before it was ready`)));
  });
  return {
    runtimePath: join(o.dir, "runtime.json"),
    close: () => new Promise(resolve => {
      if (child.exitCode !== null) return resolve();
      child.once("exit", () => resolve());
      child.stdin.end();
    }),
  };
}

// Child side. It exits when the runner closes stdin, including when the runner dies.
if (import.meta.main) {
  const app = await serveFakeApp(JSON.parse(process.argv[2]));
  process.stdin.on("end", () => app.close().then(() => process.exit(0)));
  process.stdin.resume();
  process.stdout.write("ready\n");
}
