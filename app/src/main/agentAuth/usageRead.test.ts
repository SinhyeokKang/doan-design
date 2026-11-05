import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spawnAuthProcess } from "./manager";
import { CURSOR_USAGE_URL, readUsage, type UsageReadOptions } from "./usageRead";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}-usage.json`, import.meta.url), "utf8");
let root: string, profileDir: string, probeDir: string, log: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "doan-usage-read-"));
  profileDir = join(root, "profile"); probeDir = join(root, "probe"); log = join(root, "log");
  mkdirSync(profileDir); mkdirSync(probeDir);
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const options = (over: Partial<UsageReadOptions> = {}): UsageReadOptions => ({ spawn: spawnAuthProcess, probeDir, openMs: 10_000, readMs: 1000, now: () => 1_000, ...over });
const lease = (command: string, mode = "") => ({ command, env: { PATH: process.env.PATH ?? "", HOME: profileDir, FAKE_USAGE: mode, FAKE_LOG: log }, profileDir });
const logged = () => readFileSync(log, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>);
const gone = (pid: number) => { try { process.kill(pid, 0); return false; } catch { return true; } };
function script(name: string, body: string): string {
  const path = join(root, name);
  writeFileSync(path, `#!/usr/bin/env node
const fs = require('node:fs'); const mode = process.env.FAKE_USAGE || '';
const note = value => fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(value) + '\\n');
note({ argv: process.argv.slice(2), cwd: process.cwd(), pid: process.pid });
${body}
`, { mode: 0o700 });
  return path;
}

// A Codex app-server: newline-delimited messages without a jsonrpc field.
const codex = () => script("codex", `
const send = value => process.stdout.write(JSON.stringify(value) + '\\n');
require('node:readline').createInterface({ input: process.stdin }).on('line', line => {
  const r = JSON.parse(line); note(r);
  if (r.method === 'initialize') { if (mode === 'silent-init') return; setTimeout(() => send({ id: r.id, result: { userAgent: 'fake' } }), mode === 'slow-init' ? 2000 : 0); }
  if (r.method === 'account/rateLimits/read') {
    if (mode === 'silent-read') return;
    if (mode === 'exit') process.exit(3);
    if (mode === 'not-found') send({ id: r.id, error: { code: -32601, message: 'Method not found' } });
    else send({ id: r.id, result: ${fixture("codex")} });
  }
});`);
// Copilot's headless server: JSON-RPC 2.0 with Content-Length framing, as its SDK's stdio transport.
const copilot = () => script("copilot", `
let buffer = Buffer.alloc(0);
const send = value => { const text = JSON.stringify({ jsonrpc: '2.0', ...value }); process.stdout.write('Content-Length: ' + Buffer.byteLength(text) + '\\r\\n\\r\\n' + text); };
process.stdin.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const head = buffer.indexOf('\\r\\n\\r\\n'); if (head < 0) return;
    const length = Number(/Content-Length: (\\d+)/i.exec(buffer.subarray(0, head).toString())[1]);
    if (buffer.length < head + 4 + length) return;
    const r = JSON.parse(buffer.subarray(head + 4, head + 4 + length).toString()); buffer = buffer.subarray(head + 4 + length); note(r);
    if (r.method === 'connect') { if (mode === 'silent-init') continue; send({ id: r.id, result: { protocolVersion: 3 } }); }
    if (r.method === 'account.getQuota') { if (mode === 'not-found') send({ id: r.id, error: { code: -32601, message: 'Method not found' } }); else send({ id: r.id, result: ${fixture("copilot")} }); }
  }
});`);
// Claude Code as the SDK drives it: stream-json control requests on stdin.
const claude = () => script("claude", `
const send = value => process.stdout.write(JSON.stringify(value) + '\\n');
require('node:readline').createInterface({ input: process.stdin }).on('line', line => {
  const r = JSON.parse(line); note(r);
  if (r.type !== 'control_request') return;
  const answer = response => send({ type: 'control_response', response: { subtype: 'success', request_id: r.request_id, response } });
  if (r.request.subtype === 'initialize') { if (mode !== 'silent-init') answer({ commands: [], models: [], account: {} }); return; }
  if (r.request.subtype === 'get_usage') {
    if (mode === 'unsupported') send({ type: 'control_response', response: { subtype: 'error', request_id: r.request_id, error: 'Unsupported control request subtype: get_usage' } });
    else if (mode !== 'silent-read') answer(${fixture("claude")});
    return;
  }
  answer({});
});`);

describe("Codex usage read", () => {
  it("runs a fresh app-server in the profile: initialize, initialized, account/rateLimits/read, then exits", async () => {
    const reading = await readUsage("codex", lease(codex()), options());
    expect(reading).toMatchObject({ status: "ok", readAt: 1_000, windows: [{ id: "primary", usedPercent: 38 }] });
    const [start, ...messages] = logged();
    expect(start).toMatchObject({ argv: ["-c", 'cli_auth_credentials_store="keyring"', "-c", 'mcp_oauth_credentials_store="keyring"', "app-server"] });
    expect(String(start!.cwd)).toContain("profile");
    expect(messages.map(m => m.method)).toEqual(["initialize", "initialized", "account/rateLimits/read"]);
    expect(gone(Number(start!.pid))).toBe(true);
  }, 20_000);
  it("counts the read's limit from the initialize answer, not from the process start", async () => {
    expect(await readUsage("codex", lease(codex(), "slow-init"), options())).toMatchObject({ status: "ok" });
  }, 20_000);
  it.each([
    ["no initialize answer", "silent-init", { openMs: 3000 }],
    ["no read answer", "silent-read", {}],
    ["an exit before the answer", "exit", {}],
  ])("reads %s as read_failed after the process group is gone", async (_label, mode, over) => {
    expect(await readUsage("codex", lease(codex(), mode), options(over))).toEqual({ status: "unavailable", reason: "read_failed", readAt: 1_000 });
    expect(gone(Number(logged()[0]!.pid))).toBe(true);
  }, 20_000);
  it("reads Method not found as not_supported", async () => {
    expect(await readUsage("codex", lease(codex(), "not-found"), options())).toEqual({ status: "unavailable", reason: "not_supported", readAt: 1_000 });
  }, 20_000);
  it("stops the process when aborted and resolves only after it is gone", async () => {
    const controller = new AbortController();
    const pending = readUsage("codex", lease(codex(), "silent-read"), options({ readMs: 60_000 }), controller.signal);
    await vi.waitFor(() => expect(logged().some(m => m.method === "account/rateLimits/read")).toBe(true), { timeout: 10_000 });
    controller.abort();
    expect(await pending).toMatchObject({ status: "unavailable", reason: "read_failed" });
    expect(gone(Number(logged()[0]!.pid))).toBe(true);
  }, 20_000);
});

describe("Copilot usage read", () => {
  it("runs copilot --headless --no-auto-update --stdio in Doan's empty folder with the lease environment", async () => {
    const reading = await readUsage("copilot", lease(copilot()), options());
    expect(reading).toMatchObject({ status: "ok", readAt: 1_000 });
    const [start, ...messages] = logged();
    expect(start).toMatchObject({ argv: ["--headless", "--no-auto-update", "--stdio"] });
    expect(String(start!.cwd)).toContain("probe");
    expect(messages.map(m => m.method)).toEqual(["connect", "account.getQuota"]);
    expect(messages.every(m => m.jsonrpc === "2.0")).toBe(true);
    expect(gone(Number(start!.pid))).toBe(true);
  }, 20_000);
  it("reads a missing connect answer as read_failed and Method not found as not_supported", async () => {
    expect(await readUsage("copilot", lease(copilot(), "silent-init"), options({ openMs: 3000 }))).toMatchObject({ status: "unavailable", reason: "read_failed" });
    expect(await readUsage("copilot", lease(copilot(), "not-found"), options())).toMatchObject({ status: "unavailable", reason: "not_supported" });
  }, 20_000);
});

describe("Claude usage read", () => {
  it("opens the SDK in Doan's empty folder, reads usage with skipBehaviors after initialize, and closes", async () => {
    const reading = await readUsage("claude", lease(claude()), options({ readMs: 5000 }));
    expect(reading).toMatchObject({ status: "ok", readAt: 1_000 });
    expect(reading.status === "ok" && reading.windows.slice(0, 2)).toMatchObject([{ id: "five_hour", usedPercent: 3 }, { id: "seven_day", usedPercent: 99 }]);
    const entries = logged(), start = entries[0]!;
    expect(String(start.cwd)).toContain("probe");
    const requests = entries.filter(m => m.type === "control_request").map(m => m.request as Record<string, unknown>);
    expect(requests.map(r => r.subtype)).toEqual(["initialize", "get_usage"]);
    expect(requests[1]).toMatchObject({ skip_behaviors: true });
    expect(entries.some(m => m.type === "user")).toBe(false);
    await vi.waitFor(() => expect(gone(Number(start.pid))).toBe(true));
  }, 20_000);
  it("reads an unsupported control request as not_supported and a missing initialize answer as read_failed", async () => {
    expect(await readUsage("claude", lease(claude(), "unsupported"), options({ readMs: 5000 }))).toMatchObject({ status: "unavailable", reason: "not_supported" });
    expect(await readUsage("claude", lease(claude(), "silent-init"), options({ openMs: 3000 }))).toMatchObject({ status: "unavailable", reason: "read_failed" });
  }, 30_000);
});

describe("Cursor usage read", () => {
  const SUB = "auth0|user_abc123";
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const TOKEN = `${b64({ alg: "HS256" })}.${b64({ sub: SUB, exp: 9_999_999_999 })}.secret-signature-q9z`;
  const REFRESH = "refresh-secret-r7y";
  const authFile = () => join(profileDir, ".cursor", "auth.json");
  function writeAuth(content: unknown = { accessToken: TOKEN, refreshToken: REFRESH }) { mkdirSync(join(profileDir, ".cursor"), { recursive: true }); writeFileSync(authFile(), JSON.stringify(content)); }
  // Response's url and redirected are prototype getters: an instance property stands in for what fetch would set.
  const reply = (status: number, body: string, over: Record<string, unknown> = {}) => {
    const response = new Response(body, { status, headers: { "content-type": "application/json" } });
    for (const [key, value] of Object.entries(over)) Object.defineProperty(response, key, { value });
    return response;
  };
  let errors: ReturnType<typeof vi.spyOn>[] = [];
  beforeEach(() => { errors = (["error", "warn", "log", "info", "debug"] as const).map(name => vi.spyOn(console, name).mockImplementation(() => {})); });
  afterEach(() => { for (const spy of errors) spy.mockRestore(); });
  const printed = () => JSON.stringify(errors.flatMap(spy => spy.mock.calls));
  const read = (fetch: typeof globalThis.fetch, over: Partial<UsageReadOptions> = {}) => readUsage("cursor", lease("/bin/cursor-agent"), options({ fetch, ...over }));

  it("sends one GET to the fixed address with the session cookie, refusing redirects", async () => {
    writeAuth();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => reply(200, fixture("cursor")));
    const reading = await read(fetch);
    expect(reading).toMatchObject({ status: "ok", readAt: 1_000, windows: [{ id: "auto" }, { id: "api" }] });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://cursor.com/api/usage-summary");
    expect(CURSOR_USAGE_URL).toBe("https://cursor.com/api/usage-summary");
    expect(init).toMatchObject({ method: "GET", redirect: "error", credentials: "omit" });
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    expect(init!.headers).toEqual({ Cookie: `WorkosCursorSessionToken=${encodeURIComponent(SUB)}%3A%3A${TOKEN}`, Accept: "application/json", Origin: "https://cursor.com", Referer: "https://cursor.com/dashboard" });
    expect(JSON.parse(readFileSync(authFile(), "utf8"))).toEqual({ accessToken: TOKEN, refreshToken: REFRESH });
  });
  it.each([
    ["a 401 for an expired token", () => reply(401, '{"error":"not_authenticated"}')],
    ["a followed redirect", () => reply(200, fixture("cursor"), { redirected: true })],
    ["an answer from another host", () => reply(200, fixture("cursor"), { url: "https://evil.example/api/usage-summary" })],
    ["a body over the size limit", () => reply(200, `{"pad":"${"x".repeat(200_000)}"}`)],
    ["a body that is not JSON", () => reply(200, "<html>")],
  ])("reads %s as read_failed, never refreshing the token", async (_label, answer) => {
    writeAuth();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => answer());
    expect(await read(fetch)).toEqual({ status: "unavailable", reason: "read_failed", readAt: 1_000 });
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.parse(readFileSync(authFile(), "utf8"))).toEqual({ accessToken: TOKEN, refreshToken: REFRESH });
  });
  it("gives up at its time limit and aborts the request", async () => {
    writeAuth();
    let signal: AbortSignal | undefined;
    const fetch = vi.fn<typeof globalThis.fetch>((_url, init) => new Promise((_resolve, reject) => { signal = init!.signal!; signal.addEventListener("abort", () => reject(new Error("aborted"))); }));
    expect(await read(fetch, { readMs: 100 })).toMatchObject({ status: "unavailable", reason: "read_failed" });
    expect(signal?.aborted).toBe(true);
  });
  it.each([
    ["no credential file", () => {}],
    ["a credential file that is a link", () => { mkdirSync(join(profileDir, ".cursor")); writeFileSync(join(root, "elsewhere.json"), JSON.stringify({ accessToken: TOKEN })); symlinkSync(join(root, "elsewhere.json"), authFile()); }],
    ["a token that is not a JWT", () => writeAuth({ accessToken: "opaque" })],
    ["no access token", () => writeAuth({ refreshToken: REFRESH })],
  ])("sends nothing with %s", async (_label, prepare) => {
    prepare();
    const fetch = vi.fn<typeof globalThis.fetch>();
    expect(await read(fetch)).toMatchObject({ status: "unavailable", reason: "read_failed" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps the token out of its result, its logs and its errors, whatever the request throws", async () => {
    writeAuth();
    const results: unknown[] = [];
    for (const failure of [new TypeError(`fetch failed: redirect to https://cursor.com/x?t=${TOKEN}`), Object.assign(new Error(`cookie ${TOKEN}`), { cause: { header: TOKEN, refresh: REFRESH } })]) {
      const fetch = vi.fn<typeof globalThis.fetch>(async () => { throw failure; });
      results.push(await read(fetch));
    }
    results.push(await read(vi.fn<typeof globalThis.fetch>(async () => reply(500, JSON.stringify({ echo: TOKEN })))));
    results.push(await read(vi.fn<typeof globalThis.fetch>(async () => reply(200, JSON.stringify({ isUnlimited: TOKEN })))));
    for (const value of [JSON.stringify(results), printed()]) for (const secret of [TOKEN, REFRESH, "secret-signature", SUB, encodeURIComponent(SUB)]) expect(value).not.toContain(secret);
    expect(results.every(r => (r as { reason?: string }).reason === "read_failed")).toBe(true);
  });
});
