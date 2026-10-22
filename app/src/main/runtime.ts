import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, rmdirSync, rmSync } from "node:fs";
import { chmod, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeFile, Selection, SocketErrorCode, SocketRequest, SocketResponse } from "../formats/types";
import { validateSocketRequest } from "../formats/validate";

// Electron-free on purpose, like shell.ts: index.ts supplies the open projects
// and the selection, and owns the app lifecycle around this.

const LINE_LIMIT = 64 * 1024;
const LINE_WAIT_MS = 2000;

export interface RuntimeState {
  isOpen(root: string): boolean;
  selection(): Selection | null;
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
export function answerRequest(line: string, token: string, state: RuntimeState): SocketResponse {
  const request = parseSocketRequest(line);
  if (request === null) return socketError("bad_request", "The request is not an app-socket v1 request.");
  if (!tokenMatches(request.token, token)) return socketError("bad_token", "The token does not match this app.");
  if (!state.isOpen(request.root)) return socketError("project_not_open", "The project is not open in Doan.");
  return socketResponse(state.selection(), request.root);
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
  const reply = (response: SocketResponse) => {
    done = true;
    connection.end(`${JSON.stringify(response)}\n`);
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
    if (newline !== -1) reply(answerRequest(Buffer.concat(chunks).toString("utf8"), token, state));
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
