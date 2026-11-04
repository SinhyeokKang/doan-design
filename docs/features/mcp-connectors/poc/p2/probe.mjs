// P2 probe: does a running Codex app-server see a server registered after it started,
// what does mcpServer/startupStatus/updated look like, and can a client wait on it before a turn.
// Run with env.sh sourced (CODEX_HOME isolated). Writes probe.log (one JSON line per event).
import { spawn, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { appendFileSync, writeFileSync } from "node:fs";

const P = new URL(".", import.meta.url).pathname;
const SANDBOX = P + "../p1/sandbox";
const LOG = P + "probe.log";
writeFileSync(LOG, "");
const t0 = Date.now();
const log = (kind, data) => { const line = JSON.stringify({ ms: Date.now() - t0, kind, ...data }); appendFileSync(LOG, line + "\n"); if (kind !== "raw") console.log(line.slice(0, 400)); };
const KEYRING = ["-c", 'cli_auth_credentials_store="keyring"', "-c", 'mcp_oauth_credentials_store="keyring"'];

const child = spawn("codex", [...KEYRING, "app-server"], { cwd: SANDBOX, env: process.env, stdio: ["pipe", "pipe", "pipe"] });
child.stderr.on("data", d => appendFileSync(P + "probe.stderr", d));
let nextId = 1; const pending = new Map(); const waiters = [];
const notes = [];
createInterface({ input: child.stdout }).on("line", line => {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.id !== undefined && pending.has(m.id) && (m.result !== undefined || m.error)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result); return; }
  if (m.id !== undefined && m.method) { log("server-request", { method: m.method, params: m.params }); child.stdin.write(JSON.stringify({ id: m.id, result: { decision: "accept" } }) + "\n"); return; }
  if (m.method) {
    notes.push({ ms: Date.now() - t0, ...m });
    if (/mcp/i.test(m.method) || m.method === "turn/completed" || m.method === "error") log("note", { method: m.method, params: m.params });
    else log("raw", { method: m.method });
    for (const w of [...waiters]) if (w.test(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
  }
});
const req = (method, params) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); child.stdin.write(JSON.stringify({ id, method, params }) + "\n"); });
const waitFor = (test, ms) => new Promise(resolve => { const w = { test, resolve }; waiters.push(w); setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); resolve(null); } }, ms); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const statusList = async label => { const r = await req("mcpServerStatus/list", { detail: "toolsAndAuthOnly" }); log("status-list", { label, servers: r.data.map(s => ({ name: s.name, authStatus: s.authStatus, runtimeStatus: s.runtimeStatus, tools: Object.keys(s.tools ?? {}).length })) }); return r; };
const startupFor = (threadId, since) => notes.filter(n => n.method === "mcpServer/startupStatus/updated" && n.ms >= since).map(n => ({ ms: n.ms, ...n.params, matchesThread: n.params.threadId === threadId }));

try {
  log("step", { s: "initialize" });
  await req("initialize", { clientInfo: { name: "doan-poc", version: "0.0.1" }, capabilities: { experimentalApi: true } });
  child.stdin.write(JSON.stringify({ method: "initialized" }) + "\n");
  await sleep(3000);
  log("startup-before-thread", { events: startupFor(null, 0) });

  let since = Date.now() - t0;
  const th1 = await req("thread/start", { cwd: SANDBOX });
  const id1 = th1.thread.id; log("thread", { n: 1, id: id1 });
  await sleep(15000);
  log("startup-thread1", { events: startupFor(id1, since) });
  await statusList("after thread1");

  log("step", { s: "codex mcp add doan-echo-poc (external process)" });
  execFileSync("codex", [...KEYRING, "mcp", "add", "doan-echo-poc", "--", "node", P + "echo-mcp.mjs"], { env: process.env, stdio: "inherit" });

  since = Date.now() - t0;
  const th2 = await req("thread/start", { cwd: SANDBOX });
  const id2 = th2.thread.id; log("thread", { n: 2, id: id2 });
  await sleep(8000);
  log("startup-thread2-no-reload", { events: startupFor(id2, since) });
  await statusList("after add, no reload");

  log("step", { s: "config/mcpServer/reload" });
  log("reload-result", { r: await req("config/mcpServer/reload", {}).catch(e => ({ error: e })) });
  since = Date.now() - t0;
  const th3 = await req("thread/start", { cwd: SANDBOX });
  const id3 = th3.thread.id; log("thread", { n: 3, id: id3 });
  // Wait the way Doan would: until doan-echo-poc reaches a terminal startup state for this thread, capped.
  const ready = await waitFor(m => m.method === "mcpServer/startupStatus/updated" && m.params.name === "doan-echo-poc" && m.params.status !== "starting", 20000);
  log("wait-echo", { readyAfterMs: (Date.now() - t0) - since, event: ready?.params ?? null });
  await sleep(3000);
  log("startup-thread3-after-reload", { events: startupFor(id3, since) });
  await statusList("after reload");

  log("step", { s: "turn on thread 3" });
  await req("turn/start", { threadId: id3, approvalPolicy: "never", input: [{ type: "text", text: "Call the tool `ping` from MCP server doan-echo-poc once and reply with its exact text. Do not run shell commands." }] });
  const done = await waitFor(m => m.method === "turn/completed", 180000);
  log("turn-done", { ok: !!done });
  const calls = notes.filter(n => n.method === "item/completed" && n.params?.item?.type === "mcpToolCall").map(n => ({ server: n.params.item.server, tool: n.params.item.tool, status: n.params.item.status, result: JSON.stringify(n.params.item.result ?? n.params.item.error).slice(0, 200) }));
  log("tool-calls", { calls });
  const msgs = notes.filter(n => n.method === "item/completed" && n.params?.item?.type === "agentMessage").map(n => n.params.item.text);
  log("agent-messages", { msgs });
} catch (e) { log("error", { e: String(e?.message ?? JSON.stringify(e)) }); }
finally { child.kill("SIGTERM"); setTimeout(() => process.exit(0), 500); }
