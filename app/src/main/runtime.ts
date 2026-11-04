import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, rmdirSync, rmSync } from "node:fs";
import { chmod, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OpenRequest, OpenResponse, WorkRequest, WorkResponse, OnboardingRequest, OnboardingResponse, RuntimeFile, Selection, SocketErrorCode, SocketRequest, SocketResponse } from "../formats/types";
import { validateOpenRequest, validateWorkRequest, validateOnboardingRequest, validateSocketRequest } from "../formats/validate";
import { autoRegisterRoot } from "./autoFolders";
import type { FolderState } from "./folderState";

// Electron-free on purpose, like shell.ts: index.ts supplies the open projects
// and the selection, and owns the app lifecycle around this.

const LINE_LIMIT = 64 * 1024;
export const LINE_WAIT_MS = 2000;
// The CLI's 2 s (`activeTimeout`) starts before it dials and LINE_WAIT_MS at the connection, so a registration
// answers by 1.5 s or the start is refused; the registration itself goes on (ARCHITECTURE §4 'Auto-registration').
export const AUTO_REGISTER_WAIT_MS = 1500;

export interface ActiveState {
  isOpen(root: string): boolean;
  selection(): Selection | null;
}
export interface RuntimeState extends ActiveState {
  work(request: WorkRequest): void;
  // Called only with a schema-valid v2 request whose token matched. It must answer quickly: long work answers with
  // an operation id, since the connection is cut at the 2 s deadline.
  onboarding(request: OnboardingRequest): Promise<OnboardingResponse>;
  // Called only with a schema-valid v4 request whose token matched and whose root is registered. It must answer
  // inside the 2 s deadline (deepLinks.ts OPEN_ANSWER_TIMEOUT_MS).
  open(request: OpenRequest): Promise<OpenResponse>;
  // Auto-registration of a saved repository's worktree on a v3 start (ARCHITECTURE §4 'Auto-registration'): the registered roots,
  // `doan ls --json --repo <root>` (never killed early, so a late registration still lands), and the registration,
  // which must make `isOpen(root)` true before it returns so the start's work applies.
  roots(): readonly string[];
  readRoot(root: string): Promise<FolderState>;
  adopt(root: string, view: Extract<FolderState, { kind: "list" }>): void;
}

export interface Runtime {
  readonly socket: string;
  readonly token: string;
  // `<userData>/runtime.json`.
  readonly file: string;
  // Synchronous because `will-quit` does not wait for promises; an async
  // cleanup can be cut off when the process ends.
  disposeSync(): void;
}

export function runtimeFile(socket: string, token: string): RuntimeFile {
  return { v: 1, socket, token };
}

export function parseSocketRequest(line: string): SocketRequest | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  return validateSocketRequest(value) ? value : null;
}

// `timingSafeEqual` throws on a length mismatch, so lengths are compared first;
// the length itself is not secret (always 64 hex characters).
export function tokenMatches(given: string, token: string): boolean {
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(token, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

// `root` is the CLI's discovered root, compared as a string with the stored
// project path; the app never re-derives a root (POSTMORTEM 2026-10-22).
export function socketResponse(selection: Selection | null, root: string): SocketResponse {
  return { v: 1, ok: true, result: selection !== null && selection.root === root ? { selection } : {} };
}

function socketError(code: SocketErrorCode, message: string): SocketResponse {
  return { v: 1, ok: false, error: { code, message } };
}

// The token is checked before the project so a caller without it learns
// nothing about which projects are open.
export function answerRequest(line: string, token: string, state: ActiveState): SocketResponse {
  const request = parseSocketRequest(line);
  if (request === null) return socketError("bad_request", "The request is not an app-socket v1 request.");
  if (!tokenMatches(request.token, token)) return socketError("bad_token", "The token does not match this app.");
  if (!state.isOpen(request.root)) return socketError("project_not_open", "The project is not open in Doan.");
  return socketResponse(state.selection(), request.root);
}

function onboardingError(code: "bad_request" | "bad_token", message: string): OnboardingResponse {
  return { v: 2, ok: false, error: { code, message } };
}

function openError(code: "bad_request" | "bad_token" | "project_not_open", message: string): OpenResponse {
  return { v: 4, ok: false, error: { code, message } };
}

function workError(code: "bad_request" | "bad_token" | "project_not_open", message: string): WorkResponse {
  return { v: 3, ok: false, error: { code, message } };
}

// Registrations in progress per state and root: concurrent starts share one read, and a done waits for it. Keyed by
// state so each runtime (and each test) has its own, without adding a member every RuntimeState must provide.
const registrations = new WeakMap<RuntimeState, Map<string, Promise<boolean>>>();

function register(state: RuntimeState, root: string): Promise<boolean> {
  let pending = registrations.get(state);
  if (!pending) {
    pending = new Map();
    registrations.set(state, pending);
  }
  const current = pending.get(root);
  if (current) return current;
  const task = (async () => {
    const view = await state.readRoot(root);
    if (state.isOpen(root)) return true;
    // Judged against the roots registered now: after a Remove from Doan during the read, W has no group to join and
    // must not become a project of its own.
    if (view.kind !== "list" || !autoRegisterRoot(view, { root }, state.roots())) return false;
    state.adopt(root, view);
    return state.isOpen(root);
  })().catch((error: unknown) => {
    console.error("doan: worktree registration failed", error);
    return false;
  }).finally(() => pending.delete(root));
  pending.set(root, task);
  return task;
}

// A start from an unregistered root may register it; a done only waits for a registration already running, so it
// lands after that start's work. Either way the work applies once registered, even after the answer said
// project_not_open (spec decision 5).
async function workAfterRegistration(state: RuntimeState, request: WorkRequest): Promise<WorkResponse> {
  const notOpen = workError("project_not_open", "The project is not open in Doan.");
  const pending = registrations.get(state)?.get(request.root) ??
    (request.action === "start" && state.roots().length > 0 ? register(state, request.root) : undefined);
  if (!pending) return notOpen;
  const applied = pending.then((registered): WorkResponse => {
    if (!registered) return notOpen;
    try { state.work(request); return { v: 3, ok: true }; }
    catch (error) { console.error("doan: work request failed", error); return workError("bad_request", "Doan could not handle this request."); }
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<WorkResponse>((resolve) => { timer = setTimeout(() => resolve(notOpen), AUTO_REGISTER_WAIT_MS); });
  try { return await Promise.race([applied, late]); }
  finally { clearTimeout(timer); }
}

// Unknown versions keep the v1 refusal. No version exposes state before its token matched.
type Answer = SocketResponse | OnboardingResponse | WorkResponse | OpenResponse;
export async function answerLine(line: string, token: string, state: RuntimeState): Promise<Answer> {
  let value: unknown;
  try { value = JSON.parse(line); } catch { value = null; }
  if (typeof value === "object" && value !== null && !Array.isArray(value) && Reflect.get(value, "v") === 4) {
    if (!validateOpenRequest(value)) return openError("bad_request", "The request is not an app-socket v4 request.");
    if (!tokenMatches(value.token, token)) return openError("bad_token", "The token does not match this app.");
    if (!state.isOpen(value.root)) return openError("project_not_open", "The project is not open in Doan.");
    try { return await state.open(value); }
    catch (error) { console.error("doan: open request failed", error); return openError("bad_request", "Doan could not handle this request."); }
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value) && Reflect.get(value, "v") === 3) {
    if (!validateWorkRequest(value)) return workError("bad_request", "The request is not an app-socket v3 request.");
    if (!tokenMatches(value.token, token)) return workError("bad_token", "The token does not match this app.");
    if (value.action === "start" && !/^\.doan\/(canvases|ds)\/[^/]+\.html$/.test(value.path)) return workError("bad_request", "The path is not a canvas path.");
    if (!state.isOpen(value.root)) return workAfterRegistration(state, value);
    try { state.work(value); return { v: 3, ok: true }; }
    catch (error) { console.error("doan: work request failed", error); return workError("bad_request", "Doan could not handle this request."); }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value) || Reflect.get(value, "v") !== 2) return answerRequest(line, token, state);
  if (!validateOnboardingRequest(value)) return onboardingError("bad_request", "The request is not an app-socket v2 request.");
  if (!tokenMatches(value.token, token)) return onboardingError("bad_token", "The token does not match this app.");
  try { return await state.onboarding(value); }
  // The service's own errors may name paths or provider output; the client gets none of it.
  catch (error) { console.error("doan: onboarding request failed", error); return onboardingError("bad_request", "Doan could not handle this request."); }
}

// One request line per connection, one response line, then close. A hard
// deadline rather than an idle timeout, so a client dripping bytes cannot hold
// the connection open; it also outlives the reply, since `end` only half-closes
// and a peer that never closes its side would keep the socket.
function serve(connection: Socket, token: string, state: RuntimeState): void {
  const chunks: Buffer[] = [];
  let size = 0;
  let done = false;
  const deadline = setTimeout(() => connection.destroy(), LINE_WAIT_MS);
  // A v2 answer may arrive after the deadline destroyed the connection; the work it started goes on regardless.
  const reply = (response: Answer) => {
    done = true;
    if (!connection.destroyed) connection.end(`${JSON.stringify(response)}\n`);
  };
  connection.on("data", (chunk: Buffer) => {
    if (done) return;
    const newline = chunk.indexOf(0x0a);
    const end = newline === -1 ? chunk.length : newline;
    if (size + end > LINE_LIMIT) {
      reply(socketError("bad_request", "The request line is over 64 KiB."));
      return;
    }
    chunks.push(chunk.subarray(0, end));
    size += end;
    if (newline !== -1) {
      done = true;
      // A throwing state callback still gets a reply now rather than holding the connection to the deadline.
      void answerLine(Buffer.concat(chunks).toString("utf8"), token, state).then(reply, (error: unknown) => {
        console.error("doan: socket request failed", error);
        reply(socketError("bad_request", "Doan could not handle this request."));
      });
    }
  });
  connection.on("close", () => clearTimeout(deadline));
  // A client that goes away mid-reply is not the app's problem.
  connection.on("error", () => undefined);
}

function listen(server: Server, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(path, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

// The socket lives in a fresh temp dir, not under userData: macOS `sun_path` is
// 104 bytes and a temp `--user-data-dir` can exceed it. The 0700 dir is what
// keeps other users out; the socket file itself follows the umask.
export async function startRuntime(userData: string, state: RuntimeState): Promise<Runtime> {
  const token = randomBytes(32).toString("hex");
  const dir = await mkdtemp(join(tmpdir(), "doan-"));
  const socket = join(dir, "app.sock");
  const file = join(userData, "runtime.json");
  const temp = `${file}.${process.pid}.tmp`;
  const content = JSON.stringify(runtimeFile(socket, token));
  const server = createServer((connection) => serve(connection, token, state));
  try {
    await chmod(dir, 0o700);
    await listen(server, socket);
    // Renamed into place so the CLI never reads a half-written file; a second
    // instance cannot interleave because of the single-instance lock.
    await rm(temp, { force: true });
    await writeFile(temp, content, { mode: 0o600 });
    await rename(temp, file);
  } catch (error) {
    server.close();
    await rm(dir, { recursive: true, force: true });
    await rm(temp, { force: true });
    throw error;
  }

  return {
    socket,
    token,
    file,
    disposeSync() {
      server.close();
      try { rmSync(socket, { force: true }); } catch { /* already gone */ }
      try { rmdirSync(dir); } catch { /* already gone */ }
      // Another start may have replaced the file (after a crash of this one,
      // or a quit racing a relaunch); only our own content is removed.
      try {
        if (readFileSync(file, "utf8") === content) rmSync(file);
      } catch { /* already gone */ }
    },
  };
}
