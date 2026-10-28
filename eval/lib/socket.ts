import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer, type Socket } from "node:net";
import { join, resolve } from "node:path";

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

// app-socket v2 (onboarding). app/src/formats/validate.ts cannot be imported by
// plain node (extensionless ajv path, JSON imports without attributes), so the
// same ajv build compiles the same schema $defs those shared validators load.
const ajvFromApp = createRequire(join(import.meta.dirname, "../../app/package.json"))("ajv/dist/2020");
// Default options as in validate.ts; only ajv's strict-mode warnings are muted,
// which do not change what validates.
const ajv = new ajvFromApp.default({ logger: false });
ajv.addSchema(JSON.parse(readFileSync(join(import.meta.dirname, "../../schema/app-socket.v2.schema.json"), "utf8")));
const V2 = "https://doan.design/schema/app-socket.v2.schema.json";
const requestSchema = ajv.getSchema(`${V2}#/$defs/request`);
const responseSchema = ajv.getSchema(`${V2}#/$defs/response`);
export const validOnboardingRequest = (v: unknown): boolean => requestSchema(v);
export const validOnboardingResponse = (v: unknown): boolean => responseSchema(v);

// A scenario's scripted app state. The fake is deterministic (session `s_eval`,
// `op_<n>`, `insp_<n>`) so self-test fixtures can name ids ahead of time; real
// agents still have to read them from replies.
export interface OnboardingScript {
  // agents.providers at start; only these providers can be signed in or checked.
  providers: Obj[];
  // What inspecting the open root reports it would set up; [] means already set up.
  changes: string[];
  // Providers a check makes ready. Nothing else ever becomes ready: no one
  // approves a browser sign-in during an eval run.
  readyAfterCheck: string[];
}

interface Operation {
  operationId: string; requestId: string; kind: string; state: string;
  provider?: string; error?: { code: string; message: string }; inspection?: Obj; project?: { root: string };
  // Not sent: what inspect looked at.
  path?: string; url?: string;
}

const v2error = (code: string, message: string) => ({ v: 2, ok: false, error: { code, message } });
const ACTIVE = ["pending", "running", "awaiting_user"];

// Operations move one step per status read, so an agent that never polls never sees a result.
export function onboardingApp(script: OnboardingScript, root: string) {
  const keys = ["providers", "changes", "readyAfterCheck"];
  if (!isObj(script) || !only(script, keys, keys) || !Array.isArray(script.providers) || !Array.isArray(script.changes) || !Array.isArray(script.readyAfterCheck))
    throw new Error("onboarding script must be { providers, changes, readyAfterCheck }");
  const providers: Obj[] = structuredClone(script.providers);
  const names = providers.map(p => p.provider as string);
  if (script.readyAfterCheck.some(name => !names.includes(name))) throw new Error("readyAfterCheck names a provider the script does not list");
  const sessionId = "s_eval";
  let started = false, revision = 0, agentsRevision = 1, completed = false, inspections = 0;
  let project: { root: string } | null = null;
  let latestInspection: string | null = null;
  const operations: Operation[] = [];
  const requests = new Map<string, { key: string; operationId: string }>();

  const view = (o: Operation): Obj => {
    const { path: _path, url: _url, ...shown } = o;
    return shown;
  };
  const state = (only?: Operation) => ({
    sessionId, revision, completed, agents: { revision: agentsRevision, providers: structuredClone(providers) }, project,
    operations: (only ? [only] : operations).map(view),
  });
  const ready = () => providers.some(p => (p.readiness as Obj).ready === true);
  const settle = (o: Operation) => {
    if (o.kind === "sign_in") { if (o.state === "pending") o.state = "awaiting_user"; return; }
    if (o.state !== "running") return;
    o.state = "succeeded";
    if (o.kind === "check" && script.readyAfterCheck.includes(o.provider!)) {
      Object.assign(providers.find(p => p.provider === o.provider)!, { phase: "connected", readiness: { ready: true }, error: null, actions: ["signOut"] });
      agentsRevision++;
    }
    if (o.kind === "project_inspect" && o.url !== undefined) Object.assign(o, { state: "failed", error: { code: "repository_unreachable", message: "The eval fake app reaches no repository." } });
    else if (o.kind === "project_inspect") {
      latestInspection = `insp_${++inspections}`;
      o.inspection = { inspectionId: latestInspection, candidates: [{ path: root, changes: [...script.changes] }] };
    }
    if (o.kind === "project_select") project = o.project = { root };
    if (o.kind === "complete") { o.project = { root }; completed = true; }
  };
  const create = (r: Obj, fields: Partial<Operation>): Operation => {
    const o: Operation = { operationId: `op_${operations.length + 1}`, requestId: r.requestId as string, kind: r.op as string, state: "running", ...fields };
    operations.push(o);
    revision++;
    return o;
  };

  function write(r: Obj): Obj {
    const provider = r.provider as string | undefined;
    switch (r.op) {
      case "check": {
        const p = providers.find(x => x.provider === provider);
        if (!p) return v2error("bad_request", "The eval fake app has no state for this provider.");
        if (p.phase !== "connected") return v2error("not_connected", "This agent is not connected.");
        return { operation: create(r, { provider }) };
      }
      case "sign_in":
        if (!names.includes(provider!)) return v2error("bad_request", "The eval fake app has no state for this provider.");
        if (operations.some(o => o.kind === "sign_in" && ACTIVE.includes(o.state))) return v2error("busy", "Another sign-in is in progress.");
        return { operation: create(r, { provider, state: "pending" }) };
      case "cancel": {
        const target = operations.find(o => o.operationId === r.operationId);
        if (!target) return v2error("operation_not_found", "No such operation in this session.");
        if (ACTIVE.includes(target.state)) { target.state = "cancelled"; revision++; }
        return { operation: target };
      }
      case "project_inspect":
        // The app reads the folder, so `/r/` and `/r/.` are the open root too.
        if (r.path !== undefined && resolve(r.path as string) !== root) return v2error("path_unavailable", "The folder cannot be read.");
        return { operation: create(r, r.url !== undefined ? { url: r.url as string } : { path: r.path as string }) };
      case "project_select": {
        if (r.inspectionId !== latestInspection) return v2error("inspection_stale", "Inspect the project again.");
        if (resolve(r.path as string) !== root) return v2error("not_candidate", "The path is not a candidate of this inspection.");
        if (script.changes.length > 0 && r.initialize !== true) return v2error("initialize_required", "This folder needs setup; nothing was written.");
        return { operation: create(r, {}) };
      }
      case "project_clone":
        return v2error("not_candidate", "This inspection has no repository to clone.");
      case "complete":
        if (!ready()) return v2error("no_ready_agent", "No agent is ready.");
        if (!project) return v2error("no_project", "No project is selected.");
        return { operation: create(r, {}) };
    }
    throw new Error(`unhandled op ${String(r.op)}`);
  }

  function respond(line: string, token: string): Obj {
    let r: unknown;
    try { r = JSON.parse(line); } catch { r = null; }
    if (!validOnboardingRequest(r)) return v2error("bad_request", "The request is not an app-socket v2 request.");
    const request = r as Obj;
    if (request.token !== token) return v2error("bad_token", "The token does not match this app.");
    if (request.op === "start") { started = true; return { v: 2, ok: true, op: "start", result: state() }; }
    if (!started || request.sessionId !== sessionId) return v2error("session_stale", "Run start again.");
    if (request.op === "status") {
      for (const o of operations) settle(o);
      revision++;
      if (request.operationId === undefined) return { v: 2, ok: true, op: "status", result: state() };
      const one = operations.find(o => o.operationId === request.operationId);
      return one ? { v: 2, ok: true, op: "status", result: state(one) } : v2error("operation_not_found", "No such operation in this session.");
    }
    const { v: _v, token: _t, requestId, ...args } = request;
    const key = JSON.stringify(Object.entries(args).sort());
    const seen = requests.get(requestId as string);
    if (seen && seen.key !== key) return v2error("request_conflict", "This requestId was used with other arguments.");
    if (seen) return { v: 2, ok: true, op: request.op, result: { operation: view(operations.find(o => o.operationId === seen.operationId)!) } };
    const result = write(request);
    if ("v" in result) return result;
    const operation = result.operation as Operation;
    requests.set(requestId as string, { key, operationId: operation.operationId });
    return { v: 2, ok: true, op: request.op, result: { operation: view(operation) } };
  }

  // Checked up front so a bad script fails the run setup, not a reply.
  const sample = { v: 2, ok: true, op: "start", result: state() };
  if (!validOnboardingResponse(sample)) throw new Error("onboarding script providers are not app-socket v2 agent statuses");
  const inspected = { v: 2, ok: true, op: "project_inspect", result: { operation: { operationId: "op_1", requestId: "r", kind: "project_inspect", state: "succeeded", inspection: { inspectionId: "insp_1", candidates: [{ path: root, changes: script.changes }] } } } };
  if (!validOnboardingResponse(inspected)) throw new Error("onboarding script changes are not app-socket v2 changes");

  return {
    answer(line: string, token: string): Obj {
      const reply = respond(line, token);
      if (!validOnboardingResponse(reply)) throw new Error(`the eval fake app built an invalid v2 reply: ${JSON.stringify(reply)}`);
      return reply;
    },
  };
}

export interface FakeApp { runtimePath: string; onboardingLog: string; close(): Promise<void> }
interface FakeAppOptions { dir: string; root: string; selection: Obj | null; onboarding?: OnboardingScript | null }

// `dir` must be short: macOS sun_path is 104 bytes.
export async function serveFakeApp(o: FakeAppOptions): Promise<FakeApp> {
  if (o.selection !== null && !validResponse({ v: 1, ok: true, result: { selection: o.selection } })) throw new Error("selection does not match app-socket v1");
  const token = randomBytes(32).toString("hex");
  const socketPath = join(o.dir, "app.sock");
  const runtimePath = join(o.dir, "runtime.json");
  const onboardingLog = join(o.dir, "onboarding.jsonl");
  const onboarding = o.onboarding ? onboardingApp(o.onboarding, o.root) : null;
  // Without a script the fake is an older app: a v2 line gets the v1 bad_request.
  const reply = (line: string): Obj => {
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { parsed = null; }
    if (!onboarding || !isObj(parsed) || parsed.v !== 2) return answer(line, token, o.root, o.selection);
    const response = onboarding.answer(line, token);
    // Checks read this log; the token stays out of it.
    const { token: _token, ...request } = parsed;
    appendFileSync(onboardingLog, JSON.stringify({ request, response }) + "\n", { mode: 0o600 });
    return response;
  };
  const connections = new Set<Socket>();
  const server = createServer(connection => {
    connections.add(connection);
    connection.on("close", () => connections.delete(connection));
    connection.on("error", () => undefined);
    let buffer = "";
    connection.on("data", chunk => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline !== -1) connection.end(JSON.stringify(reply(buffer.slice(0, newline))) + "\n");
    });
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(socketPath, resolve); });
  writeFileSync(runtimePath, JSON.stringify({ v: 1, socket: socketPath, token }), { mode: 0o600 });
  return {
    runtimePath,
    onboardingLog,
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
  // Watched from spawn: after a signal, exitCode stays null and "exit" has
  // already fired, so close must not wait for it again (POSTMORTEM 2026-10-23).
  const exited = new Promise<void>(resolve => child.once("exit", () => resolve()));
  // Ending stdin of a child that is already gone fails with EPIPE.
  child.stdin.on("error", () => undefined);
  await new Promise<void>((resolve, reject) => {
    let out = "";
    child.stdout.on("data", chunk => { out += chunk; if (out.includes("ready\n")) resolve(); });
    child.on("exit", code => reject(new Error(`fake app exited (${code}) before it was ready`)));
  });
  return {
    runtimePath: join(o.dir, "runtime.json"),
    onboardingLog: join(o.dir, "onboarding.jsonl"),
    // Bounded either way, so a stuck child cannot hold up the run's disposal.
    async close() {
      child.stdin.end();
      if (await settlesWithin(exited, CLOSE_GRACE_MS)) return;
      child.kill("SIGKILL");
      await settlesWithin(exited, CLOSE_GRACE_MS);
    },
  };
}

const CLOSE_GRACE_MS = 2000;

async function settlesWithin(promise: Promise<void>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), ms); });
  try { return await Promise.race([promise.then(() => true), timeout]); } finally { clearTimeout(timer); }
}

// Child side. It exits when the runner closes stdin, including when the runner dies.
if (import.meta.main) {
  const app = await serveFakeApp(JSON.parse(process.argv[2]));
  process.stdin.on("end", () => app.close().then(() => process.exit(0)));
  process.stdin.resume();
  process.stdout.write("ready\n");
}
