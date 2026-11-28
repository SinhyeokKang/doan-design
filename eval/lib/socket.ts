import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer, type Socket } from "node:net";
import { join, resolve } from "node:path";
import { readRegularFileNoFollowSync } from "../../app/src/main/regularFile.ts";
import { ATTRIBUTES_BYTES, CANVAS_BYTES, LOG_BYTES, MANIFEST_BYTES, readArtifact, resolveOnDisk } from "./artifact.ts";
import { settlesWithin } from "./canvas-watch.ts";
import { contentHash } from "./work.ts";
import type { Check } from "./types.ts";

// Stand-in for the app side of `doan active` (runtime.v1 file, app-socket.v1 socket, as app/src/main/runtime.ts).
// The validators follow schema/*.schema.json and are tested against its fixtures.

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

// app-socket v2: plain node cannot import app/src/formats/validate.ts (extensionless ajv path, bare JSON imports),
// so the same ajv build compiles the same schema $defs.
const ajvFromApp = createRequire(join(import.meta.dirname, "../../app/package.json"))("ajv/dist/2020");
// Default options as in validate.ts; only ajv's strict-mode warnings are muted,
// which do not change what validates.
const ajv = new ajvFromApp.default({ logger: false });
// Add every file before the first getSchema: v3's frame $refs v4's frameId by its absolute $id.
for (const version of ["v2", "v3", "v4", "v5", "v6", "v8"]) ajv.addSchema(JSON.parse(readFileSync(join(import.meta.dirname, `../../schema/app-socket.${version}.schema.json`), "utf8")));
const V2 = "https://doan.design/schema/app-socket.v2.schema.json";
const requestSchema = ajv.getSchema(`${V2}#/$defs/request`);
const responseSchema = ajv.getSchema(`${V2}#/$defs/response`);
export const validOnboardingRequest = (v: unknown): boolean => requestSchema(v);
export const validOnboardingResponse = (v: unknown): boolean => responseSchema(v);

const V3 = "https://doan.design/schema/app-socket.v3.schema.json";
const workRequestSchema = ajv.getSchema(`${V3}#/$defs/request`);
const workResponseSchema = ajv.getSchema(`${V3}#/$defs/response`);
export const validWorkRequest = (v: unknown): boolean => workRequestSchema(v);
export const validWorkResponse = (v: unknown): boolean => workResponseSchema(v);

const V4 = "https://doan.design/schema/app-socket.v4.schema.json";
const openRequestSchema = ajv.getSchema(`${V4}#/$defs/request`);
const openResponseSchema = ajv.getSchema(`${V4}#/$defs/response`);
export const validOpenRequest = (v: unknown): boolean => openRequestSchema(v);
export const validOpenResponse = (v: unknown): boolean => openResponseSchema(v);

const V5 = "https://doan.design/schema/app-socket.v5.schema.json";
const handoffRequestSchema = ajv.getSchema(`${V5}#/$defs/request`);
const handoffResponseSchema = ajv.getSchema(`${V5}#/$defs/response`);
export const validHandoffRequest = (v: unknown): boolean => handoffRequestSchema(v);
export const validHandoffResponse = (v: unknown): boolean => handoffResponseSchema(v);

const V6 = "https://doan.design/schema/app-socket.v6.schema.json";
const prototypeRequestSchema = ajv.getSchema(`${V6}#/$defs/request`);
const prototypeResponseSchema = ajv.getSchema(`${V6}#/$defs/response`);
export const validPrototypeRequest = (v: unknown): boolean => prototypeRequestSchema(v);
export const validPrototypeResponse = (v: unknown): boolean => prototypeResponseSchema(v);

const V8 = "https://doan.design/schema/app-socket.v8.schema.json";
const sendRequestSchema = ajv.getSchema(`${V8}#/$defs/request`);
const sendResponseSchema = ajv.getSchema(`${V8}#/$defs/response`);
export const validSendRequest = (v: unknown): boolean => sendRequestSchema(v);
export const validSendResponse = (v: unknown): boolean => sendResponseSchema(v);

// The fake is deterministic (session `s_eval`, `op_<n>`, `insp_<n>`) so self-test fixtures can name ids ahead;
// real agents still have to read them from replies.
export interface OnboardingScript {
  // The auth state of each provider at start; only these can be signed in or
  // checked. The status DTO is derived from it (fakeAuthStatus).
  providers: FakeAuth[];
  // What inspecting the open root reports it would set up; [] means already set up.
  changes: string[];
  // Providers a check makes ready. Nothing else ever becomes ready: no one
  // approves a browser sign-in during an eval run.
  readyAfterCheck: string[];
  // Whether first run was already finished at start (default false); `complete`
  // sets it too. start and status report it.
  completed?: boolean;
}

// The part of agent-auth's AuthState the fake needs: no account, no tool or
// version problems besides a missing CLI, and only a check can fail.
export interface FakeAuth {
  provider: string;
  cli?: "missing";
  connected: boolean;
  verified: boolean;
  attempt?: { kind: "check" | "signIn"; cancelled: boolean } | null;
  error?: "check_failed" | null;
}

// Mirrors phaseOf, readiness and actions in app/src/main/agentAuth/state.ts for
// FakeAuth states; socket.test.ts compares it with authStatus.
export function fakeAuthStatus(a: FakeAuth): Obj {
  const attempt = a.attempt ?? null;
  const phase = attempt ? (attempt.kind === "check" ? "checking" : "signingIn") : a.connected ? "connected" : "disconnected";
  const readiness = a.cli === "missing" ? { ready: false, cause: "cli_missing", action: "install" }
    : attempt && attempt.kind !== "check" ? { ready: false, cause: "busy", action: "wait" }
    : !a.connected ? { ready: false, cause: "not_connected", action: "signIn" }
    : !a.verified ? { ready: false, cause: "unverified", action: attempt ? "wait" : "retry" }
    : { ready: true };
  const actions = attempt ? (attempt.kind === "signIn" && !attempt.cancelled ? ["cancel"] : [])
    : !a.connected ? ["signIn"] : !a.verified || a.error === "check_failed" ? ["retry", "signOut"] : ["signOut"];
  return { provider: a.provider, phase, readiness, error: a.error ? { code: a.error, retryable: true } : null, actions };
}

interface Operation {
  operationId: string; requestId: string; kind: string; state: string; cancelling?: true;
  provider?: string | undefined; error?: { code: string; message: string }; inspection?: Obj; project?: { root: string };
  // Not sent: what inspect looked at and whether select was asked to set up.
  path?: string; url?: string; initialize?: boolean;
}

const v2error = (code: string, message: string) => ({ v: 2, ok: false, error: { code, message } });
const ACTIVE = ["pending", "running", "awaiting_user"];

// Operations move one step per status read, so an agent that never polls sees no result. `initialize` runs once
// when a select that asked for setup settles, and false fails it as the app's refused init does; without it the fake
// only reports success.
export function onboardingApp(script: OnboardingScript, root: string, initialize?: (changes: string[]) => boolean) {
  const keys = ["providers", "changes", "readyAfterCheck", "completed"];
  if (!isObj(script) || !only(script, keys, keys.slice(0, 3)) || !Array.isArray(script.providers) || !Array.isArray(script.changes) || !Array.isArray(script.readyAfterCheck))
    throw new Error("onboarding script must be { providers, changes, readyAfterCheck, completed? }");
  if ("completed" in script && typeof script.completed !== "boolean") throw new Error("onboarding script completed must be a boolean");
  const authKeys = ["provider", "cli", "connected", "verified"];
  for (const a of script.providers as unknown[])
    if (!isObj(a) || !only(a, authKeys, ["provider", "connected", "verified"]) || typeof a.connected !== "boolean" || typeof a.verified !== "boolean"
      || (a.verified && !a.connected) || ("cli" in a && a.cli !== "missing"))
      throw new Error("onboarding script providers must be { provider, cli?: \"missing\", connected, verified } with verified only when connected");
  const providers: FakeAuth[] = structuredClone(script.providers).map(a => ({ ...a, attempt: null, error: null }));
  const names = providers.map(p => p.provider);
  if (new Set(names).size !== names.length) throw new Error("onboarding script lists a provider twice");
  if (script.readyAfterCheck.some(name => !providers.find(p => p.provider === name)?.connected)) throw new Error("readyAfterCheck must name connected providers of the script");
  const auth = (provider: string) => providers.find(p => p.provider === provider)!;
  const sessionId = "s_eval";
  let started = false, revision = 0, agentsRevision = 1, completed = script.completed ?? false, inspections = 0;
  let project: { root: string } | null = null;
  let latestInspection: string | null = null;
  const operations: Operation[] = [];
  const requests = new Map<string, { key: string; operationId: string }>();

  const view = (o: Operation): Obj => {
    const { path: _path, url: _url, initialize: _initialize, ...shown } = o;
    return shown;
  };
  const state = (only?: Operation) => ({
    sessionId, revision, completed, agents: { revision: agentsRevision, providers: providers.map(fakeAuthStatus) }, project,
    operations: (only ? [only] : operations).map(view),
  });
  const ready = () => providers.some(p => (fakeAuthStatus(p).readiness as Obj).ready === true);
  const settle = (o: Operation) => {
    if (o.kind === "sign_in") {
      if (o.state === "pending") o.state = "awaiting_user";
      // A cancelled sign-in stays running until its cleanup ends, then the
      // profile it may have touched is unverified (agent-auth `settled`).
      if (o.cancelling) {
        delete o.cancelling;
        o.state = "cancelled";
        Object.assign(auth(o.provider!), { attempt: null, verified: false });
        agentsRevision++;
      }
      return;
    }
    if (o.state !== "running") return;
    o.state = "succeeded";
    if (o.kind === "check") {
      const a = auth(o.provider!);
      // A check verifies what it can; anything else is agent-auth's check_failed.
      if (a.verified || script.readyAfterCheck.includes(a.provider)) Object.assign(a, { attempt: null, verified: true, error: null });
      else {
        Object.assign(a, { attempt: null, error: "check_failed" });
        Object.assign(o, { state: "failed", error: { code: "check_failed", message: "The eval fake app could not verify this connection." } });
      }
      agentsRevision++;
    }
    if (o.kind === "project_inspect" && o.url !== undefined) Object.assign(o, { state: "failed", error: { code: "repository_unreachable", message: "The eval fake app reaches no repository." } });
    else if (o.kind === "project_inspect") {
      latestInspection = `insp_${++inspections}`;
      o.inspection = { inspectionId: latestInspection, candidates: [{ path: root, changes: [...script.changes] }] };
    }
    if (o.kind === "project_select") {
      if (o.initialize && script.changes.length > 0 && initialize?.([...script.changes]) === false)
        Object.assign(o, { state: "failed", error: { code: "init_failed", message: "Doan could not set up the project." } });
      else project = o.project = { root };
    }
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
        if (!names.includes(provider!)) return v2error("bad_request", "The eval fake app has no state for this provider.");
        const a = auth(provider!);
        if (!a.connected) return v2error("not_connected", "This agent is not connected.");
        if (a.attempt) return v2error("busy", "This agent is busy.");
        a.attempt = { kind: "check", cancelled: false };
        agentsRevision++;
        return { operation: create(r, { provider }) };
      }
      case "sign_in": {
        if (!names.includes(provider!)) return v2error("bad_request", "The eval fake app has no state for this provider.");
        if (providers.some(p => p.attempt?.kind === "signIn") || auth(provider!).attempt) return v2error("busy", "Another sign-in is in progress.");
        auth(provider!).attempt = { kind: "signIn", cancelled: false };
        agentsRevision++;
        return { operation: create(r, { provider, state: "pending" }) };
      }
      case "cancel": {
        const target = operations.find(o => o.operationId === r.operationId);
        if (!target) return v2error("operation_not_found", "No such operation in this session.");
        if (target.kind === "sign_in" && ACTIVE.includes(target.state) && !target.cancelling) {
          Object.assign(target, { state: "running", cancelling: true });
          auth(target.provider!).attempt!.cancelled = true;
          agentsRevision++;
          revision++;
        } else if (target.kind !== "sign_in" && target.kind !== "check" && ACTIVE.includes(target.state)) {
          // agent-auth cancels only sign-ins; a check runs to its result.
          target.state = "cancelled";
          revision++;
        }
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
        return { operation: create(r, r.initialize === true ? { initialize: true } : {}) };
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

// What the app's initialize writes: `doan init` without token CSS (config in cli/internal/cli/init.go, attribute
// lines in storage.go, compared by socket.test.ts).
const ATTRIBUTE_LINES = [".doan/** linguist-documentation"];
const INIT_CONFIG = JSON.stringify({ v: 1 }, null, 2) + "\n";

// Sets `root` up as the real app would, or returns false where its `doan init` refuses: a setup path that leaves the
// folder or is a dangling link (cli/internal/cli/init.go). Files written are recorded in `manifest`, which changedFiles()
// reads to keep the app's writes apart from the agent's.
export function initializeRepo(root: string, changes: string[], manifest: string): boolean {
  for (const path of [".doan/canvases", ".doan", ".doan/config.json", ".gitattributes"]) {
    try { resolveOnDisk(root, path); } catch { return false; }
    let link = false;
    try { link = lstatSync(join(root, path)).isSymbolicLink(); } catch { /* missing */ }
    if (link && !existsSync(join(root, path))) return false;
  }
  const written: Record<string, string> = existsSync(manifest) ? JSON.parse(readArtifact(manifest, MANIFEST_BYTES).toString("utf8")) : {};
  if (changes.includes(".doan/canvases/")) mkdirSync(join(root, ".doan/canvases"), { recursive: true });
  if (changes.includes(".doan/config.json")) {
    mkdirSync(join(root, ".doan"), { recursive: true });
    writeFileSync(join(root, ".doan/config.json"), INIT_CONFIG);
    written[".doan/config.json"] = INIT_CONFIG;
  }
  // Like init, adds only the attribute lines that are missing.
  if (changes.includes(".gitattributes") || changes.includes(".doan/config.json")) {
    let attributes = existsSync(join(root, ".gitattributes")) ? readArtifact(join(root, ".gitattributes"), ATTRIBUTES_BYTES).toString("utf8") : "";
    const present = attributes.split("\n").map(line => line.replace(/\r$/, ""));
    const missing = ATTRIBUTE_LINES.filter(line => !present.includes(line));
    if (missing.length > 0) {
      const newline = attributes.includes("\r\n") ? "\r\n" : "\n";
      if (attributes !== "" && !attributes.endsWith("\n")) attributes += newline;
      for (const line of missing) attributes += line + newline;
      writeFileSync(join(root, ".gitattributes"), attributes);
      written[".gitattributes"] = attributes;
    }
  }
  writeFileSync(manifest, JSON.stringify(written) + "\n", { mode: 0o600 });
  return true;
}

// The canvas's static frame ids as the CLI parses them for the app's canvas list, or null when the list does not have
// the canvas. The app also lists frames a canvas script draws at runtime; the fake's canvases declare theirs in markup.
// An unreadable list throws: answering canvas_not_found would charge the fake's failure to the agent.
function listedFrames(cli: string, root: string, runtime: string, path: string): unknown[] | null {
  const listed = spawnSync(cli, ["ls", "--json", "--repo", root], { env: { ...process.env, DOAN_RUNTIME: runtime }, encoding: "utf8", timeout: 30_000 });
  let reply: unknown = null;
  try { reply = JSON.parse(listed.stdout); } catch { /* reported below */ }
  const canvases = isObj(reply) && isObj(reply.result) ? reply.result.canvases : null;
  if (listed.status !== 0 || !Array.isArray(canvases)) throw new Error(`the eval fake app cannot read the canvas list: exit ${listed.status} ${listed.stderr}`);
  const item: unknown = canvases.find(entry => isObj(entry) && entry.path === path);
  return isObj(item) && Array.isArray(item.frames) ? item.frames.map(frame => isObj(frame) ? frame.id : null) : null;
}

export interface FakeApp { runtimePath: string; onboardingLog: string; workLog: string; openLog: string; handoffLog: string; prototypeLog: string; errorLog: string; close(): Promise<void> }
// Without workOthers the fake is an older app with no `others`; without handoff, one that does not know v5 or v8.
// handoff.key is DOAN_HANDOFF; canvas null is a project conversation, which never meets same_canvas. received.chain
// is the conversation ids of the message-started turn this conversation runs (one to five): its step is the chain's
// length, and a turn without it is at step 0.
// cli: the doan whose canvas list the fake reads frames from, as the app does; a v4 request with a frame needs it.
interface FakeAppOptions { dir: string; root: string; selection: Obj | null; cli?: string; onboarding?: OnboardingScript | null; workOthers?: Obj[] | null; handoff?: { key: string; canvas: string | null; received?: { chain: string[] } } | null }

// The manifest initializeRepo keeps beside the runtime file.
export const APP_WRITES = "app-writes.json";

// `dir` must be short: macOS sun_path is 104 bytes.
export async function serveFakeApp(o: FakeAppOptions): Promise<FakeApp> {
  if (o.selection !== null && !validResponse({ v: 1, ok: true, result: { selection: o.selection } })) throw new Error("selection does not match app-socket v1");
  if (o.workOthers && !validWorkResponse({ v: 3, ok: true, others: o.workOthers })) throw new Error("workOthers does not match app-socket v3");
  const token = randomBytes(32).toString("hex");
  const socketPath = join(o.dir, "app.sock");
  const runtimePath = join(o.dir, "runtime.json");
  const onboardingLog = join(o.dir, "onboarding.jsonl");
  const workLog = join(o.dir, "work.jsonl");
  const openLog = join(o.dir, "open.jsonl");
  const handoffLog = join(o.dir, "handoff.jsonl");
  const prototypeLog = join(o.dir, "prototype.jsonl");
  const errorLog = join(o.dir, "app-errors.jsonl");
  const paths = new Set<string>();
  const handoffTaken = new Set<string>();
  const contents = (path: string): Buffer | null => {
    try {
      return readRegularFileNoFollowSync(resolveOnDisk(o.root, path), CANVAS_BYTES);
    } catch {
      // Missing or unreadable content has no snapshot; it must not stop logging.
      return null;
    }
  };
  const snapshot = (path: string): string | null => contentHash(contents(path));
  const onboarding = o.onboarding ? onboardingApp(o.onboarding, o.root, changes => initializeRepo(o.root, changes, join(o.dir, APP_WRITES))) : null;
  // Without a script the fake is an older app: a v2 line gets the v1 bad_request.
  const reply = (line: string): Obj => {
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { parsed = null; }
    if (isObj(parsed) && parsed.v === 3) {
      const fail = (code: string, message: string) => ({ v: 3, ok: false, error: { code, message } });
      const response = !validWorkRequest(parsed) ? fail("bad_request", "The request is not an app-socket v3 request.")
        : parsed.token !== token ? fail("bad_token", "The token does not match this app.")
        : parsed.root !== o.root ? fail("project_not_open", "The project is not open in Doan.")
        // The app answers others only on start and update, never on done or an error.
        : o.workOthers && parsed.action !== "done" ? { v: 3, ok: true, others: o.workOthers } : { v: 3, ok: true };
      const hashes: Record<string, string | null> = {};
      if (response.ok) {
        if (typeof parsed.path === "string") paths.add(parsed.path);
        for (const path of paths) hashes[path] = snapshot(path);
      }
      const canvas = response.ok && parsed.action === "update" ? { canvas: contents(parsed.path as string)?.toString("utf8") ?? null } : {};
      const { token: _token, ...request } = parsed;
      appendFileSync(workLog, JSON.stringify({ request, response, at: new Date().toISOString(), hashes, ...canvas }) + "\n", { mode: 0o600 });
      return response;
    }
    if (isObj(parsed) && parsed.v === 4) {
      const fail = (code: string, message: string) => ({ v: 4, ok: false, error: { code, message } });
      // The app's order: shape, token, project, then the canvas list. The list is the canvases on disk; the fake has
      // no locked page, dialog or first run, so it never answers busy or not_ready.
      const hashes: Record<string, string | null> = {};
      const open = () => {
        if (!validOpenRequest(parsed)) return fail("bad_request", "The request is not an app-socket v4 request.");
        if (parsed.token !== token) return fail("bad_token", "The token does not match this app.");
        if (parsed.root !== o.root) return fail("project_not_open", "The project is not open in Doan.");
        const path = parsed.path as string;
        const canvas = contents(path);
        if (!canvas) return fail("canvas_not_found", "The canvas is not in this project's list.");
        let frame = "none";
        if (parsed.frame !== undefined) {
          if (o.cli === undefined) throw new Error("the eval fake app needs cli to answer a frame");
          const frames = listedFrames(o.cli, o.root, runtimePath, path);
          if (frames === null) return fail("canvas_not_found", "The canvas is not in this project's list.");
          frame = frames.includes(parsed.frame) ? "found" : "missing";
        }
        hashes[path] = contentHash(canvas);
        return { v: 4, ok: true, opened: true, frame };
      };
      const response = open();
      if (!validOpenResponse(response)) throw new Error(`the eval fake app built an invalid v4 reply: ${JSON.stringify(response)}`);
      const { token: _token, ...request } = parsed;
      appendFileSync(openLog, JSON.stringify({ request, response, at: new Date().toISOString(), hashes }) + "\n", { mode: 0o600 });
      return response;
    }
    if (isObj(parsed) && parsed.v === 6) {
      const fail = (code: string, message: string) => ({ v: 6, ok: false, error: { code, message } });
      // Frame judgment belongs to the CLI. This fake has no loading project, first run or buddy screen,
      // so it cannot reach not_ready or busy; it acknowledges playback without rendering a window.
      const response = !validPrototypeRequest(parsed) ? fail("bad_request", "The request is not an app-socket v6 request.")
        : parsed.token !== token ? fail("bad_token", "The token does not match this app.")
        : parsed.root !== o.root ? fail("project_not_open", "The project is not open in Doan.")
        : snapshot(parsed.path as string) === null ? fail("canvas_not_found", "The canvas is not in this project's list.")
        : { v: 6, ok: true, played: true };
      const hashes: Record<string, string | null> = {};
      if (response.ok && typeof parsed.path === "string") hashes[parsed.path] = snapshot(parsed.path);
      if (!validPrototypeResponse(response)) throw new Error(`the eval fake app built an invalid v6 reply: ${JSON.stringify(response)}`);
      const { token: _token, ...request } = parsed;
      appendFileSync(prototypeLog, JSON.stringify({ request, response, at: new Date().toISOString(), hashes }) + "\n", { mode: 0o600 });
      return response;
    }
    if (isObj(parsed) && (parsed.v === 5 || parsed.v === 8) && o.handoff) {
      const v = parsed.v;
      const valid = v === 5 ? validHandoffRequest : validSendRequest, validReply = v === 5 ? validHandoffResponse : validSendResponse;
      const fail = (code: string, message: string) => ({ v, ok: false, error: { code, message } });
      const step = o.handoff.received?.chain.length ?? 0;
      // The app's order for the checks this fake can reach: shape, token, project, key, the asking turn's own state,
      // then the chain. A refused request does not reserve its canvas path and does not count as received.
      const response = !valid(parsed) ? fail("bad_request", `The request is not an app-socket v${v} request.`)
        : parsed.token !== token ? fail("bad_token", "The token does not match this app.")
        : parsed.root !== o.root ? fail("project_not_open", "The project is not open in Doan.")
        : parsed.handoff !== o.handoff.key ? fail("not_app_conversation", "This is not a Doan app conversation.")
        : typeof parsed.path === "string" && handoffTaken.has(parsed.path) ? fail("already_requested", "This turn already handed off to this canvas.")
        : o.handoff.canvas !== null && parsed.path === o.handoff.canvas ? fail("same_canvas", "The target is the canvas this conversation works on.")
        : step >= 5 ? fail("chain_limit", "This chain reached 5 steps.")
        : step >= 1 && handoffTaken.size > 0 ? fail("chain_one", "A turn started by a message can send only once.")
        : { v, ok: true, requested: true };
      if (response.ok && typeof parsed.path === "string") handoffTaken.add(parsed.path);
      // The target's hash when the request arrived, so a check can tell a canvas written before the request from one
      // still being edited.
      const hashes: Record<string, string | null> = {};
      if (response.ok && typeof parsed.path === "string") hashes[parsed.path] = snapshot(parsed.path);
      if (!validReply(response)) throw new Error(`the eval fake app built an invalid v${v} reply: ${JSON.stringify(response)}`);
      const { token: _token, ...request } = parsed;
      appendFileSync(handoffLog, JSON.stringify({ request, response, at: new Date().toISOString(), hashes }) + "\n", { mode: 0o600 });
      return response;
    }
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
      if (newline === -1) return;
      const line = buffer.slice(0, newline);
      let answer: string;
      try {
        answer = JSON.stringify(reply(line)) + "\n";
      } catch (error) {
        // The fake's own failure gets no answer, which the agent would read as its outcome, and must not end the fake.
        let request: unknown = null;
        try { request = JSON.parse(line); } catch { /* recorded as null */ }
        if (isObj(request)) { const { token: _token, ...rest } = request; request = rest; }
        appendFileSync(errorLog, JSON.stringify({ request, error: (error as Error).stack ?? String(error), at: new Date().toISOString() }) + "\n", { mode: 0o600 });
        connection.end();
        return;
      }
      connection.end(answer);
    });
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(socketPath, resolve); });
  writeFileSync(runtimePath, JSON.stringify({ v: 1, socket: socketPath, token }), { mode: 0o600 });
  return {
    runtimePath,
    onboardingLog,
    workLog,
    openLog,
    handoffLog,
    prototypeLog,
    errorLog,
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
    workLog: join(o.dir, "work.jsonl"),
    openLog: join(o.dir, "open.jsonl"),
    handoffLog: join(o.dir, "handoff.jsonl"),
    prototypeLog: join(o.dir, "prototype.jsonl"),
    errorLog: join(o.dir, "app-errors.jsonl"),
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

// Failures the fake app recorded fail the run as the harness's: the agent's app calls after one may have failed for it.
export function fakeAppErrors(log: string): Check[] {
  const text = existsSync(log) ? readArtifact(log, LOG_BYTES).toString("utf8").trim() : "";
  return text ? [{ id: "fake_app_error", pass: false, detail: `the eval fake app failed while answering: ${text}` }] : [];
}

// Child side. It exits when the runner closes stdin, including when the runner dies.
if (import.meta.main) {
  const app = await serveFakeApp(JSON.parse(process.argv[2]!));
  process.stdin.on("end", () => { void app.close().then(() => process.exit(0)); });
  process.stdin.resume();
  process.stdout.write("ready\n");
}
