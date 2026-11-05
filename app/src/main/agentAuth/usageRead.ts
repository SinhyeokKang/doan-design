import { spawn as spawnChild } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { OwnedGroup } from "../conversation/process";
import type { AuthProcess, Lease, Spawn } from "./manager";
import { PROVIDER_AUTH } from "./providers";
import { claudeUsage, codexUsage, copilotUsage, cursorUsage, usageNotSupported } from "./usageParse";
import type { UsageReading } from "./usageTypes";
import type { Provider } from "./types";

export type UsageProvider = Exclude<Provider, "antigravity">;
// A provider process may take tens of seconds to answer initialize under heavy load (POSTMORTEM 2026-11-01), so the
// start has its own bound and the read's limit starts at that answer. Reads answered in 0.2-1 s in the PoC.
export const USAGE_OPEN_MS = 60_000;
export const USAGE_READ_MS = 15_000;
// The one address the Cursor read may reach (ARCHITECTURE §7 'Agent usage'): fixed host, no redirect.
export const CURSOR_USAGE_URL = "https://cursor.com/api/usage-summary";
const CURSOR_ORIGIN = "https://cursor.com";
// The PoC answer was 590 bytes; the credential file is a few hundred.
const CURSOR_BODY_LIMIT = 64 * 1024;
const CURSOR_FILE_LIMIT = 64 * 1024;
const OUTPUT_LIMIT = 4 * 1024 * 1024;

export interface UsageReadOptions {
  // A provider process in its own group; resolves gone once the group is gone (manager.ts spawnAuthProcess).
  spawn: Spawn;
  // A Doan-owned empty folder under userData: the Claude and Copilot reads must not pick up a repo's settings.
  probeDir: string;
  fetch?: typeof globalThis.fetch; now?: () => number; openMs?: number; readMs?: number;
}
// A failure in Doan's own words: never a reply body, a provider message or a credential.
class ReadFailure extends Error {}
class Stopped extends Error {}

export function parseUsage(provider: UsageProvider, response: unknown, readAt: number): UsageReading {
  return provider === "claude" ? claudeUsage(response, readAt) : provider === "codex" ? codexUsage(response, readAt)
    : provider === "copilot" ? copilotUsage(response, readAt) : cursorUsage(response, readAt);
}

// One usage read in a process opened only for it (start, sign-in, popover, refresh). Never throws, and resolves only
// after the process group is gone, so the lease it runs under can be released right after.
export async function readUsage(provider: UsageProvider, lease: Pick<Lease, "command" | "env" | "profileDir"> & { organization?: string }, options: UsageReadOptions, signal?: AbortSignal): Promise<UsageReading> {
  const now = options.now ?? Date.now;
  try {
    if (signal?.aborted) throw new Stopped();
    // Created empty and never written by Doan.
    if (provider === "claude" || provider === "copilot") mkdirSync(options.probeDir, { recursive: true });
    const response = provider === "claude" ? await claudeRead(lease, options, signal)
      : provider === "codex" ? await rpcRead(lease, options, signal, {
        args: [...PROVIDER_AUTH.codex.args, "app-server"], cwd: lease.profileDir, framed: false,
        open: ["initialize", { clientInfo: { name: "doan", version: "0.1.0" }, capabilities: { experimentalApi: true } }], initialized: true,
        read: ["account/rateLimits/read", undefined],
      })
      : provider === "copilot" ? await rpcRead(lease, options, signal, {
        // The SDK's server mode: Doan's ACP mode answers account.getQuota with Method not found (PoC U3).
        args: [...PROVIDER_AUTH.copilot.args, "--headless", "--no-auto-update", "--stdio"], cwd: options.probeDir, framed: true,
        open: ["connect", { supportedTaskKinds: ["agent", "client", "shell"] }], initialized: false,
        read: ["account.getQuota", {}],
      })
      : await cursorRead(lease, options, signal);
    return parseUsage(provider, response, now());
  } catch (error) {
    if (provider !== "cursor" && !(error instanceof ReadFailure) && usageNotSupported(error)) return { status: "unavailable", reason: "not_supported", readAt: now() };
    if (!(error instanceof Stopped) && !signal?.aborted) console.error(`doan: ${provider} usage read failed: ${error instanceof ReadFailure ? error.message : "the read could not be completed"}`);
    return { status: "unavailable", reason: "read_failed", readAt: now() };
  }
}

function within<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([work, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new ReadFailure(`no answer to ${what} within ${ms} ms`)), ms); })]).finally(() => clearTimeout(timer));
}
function stopped(signal: AbortSignal | undefined): { promise: Promise<never>; dispose(): void } {
  let dispose = () => {};
  const promise = new Promise<never>((_resolve, reject) => {
    if (!signal) return;
    const stop = () => reject(new Stopped());
    if (signal.aborted) { stop(); return; }
    signal.addEventListener("abort", stop, { once: true });
    dispose = () => signal.removeEventListener("abort", stop);
  });
  promise.catch(() => {});
  return { promise, dispose: () => dispose() };
}

// The server's error answer; usageNotSupported reads its code and message, which never reach a log.
class RpcFailure extends Error { constructor(readonly code: unknown, message: string) { super(message); } }
// JSON-RPC over a provider's stdio: Codex's app-server (one message per line, no jsonrpc field) or Copilot's headless
// server (Content-Length frames, JSON-RPC 2.0). Server requests and notifications are not answered: neither read needs them.
class StdioRpc {
  private next = 1;
  private pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  private buffer = Buffer.alloc(0);
  private broken: Error | null = null;
  constructor(private readonly child: AuthProcess, private readonly framed: boolean) {
    child.onOutput((text, stream) => { if (stream !== "stderr") this.receive(text); });
  }
  request(method: string, params: unknown): Promise<unknown> {
    if (this.broken) return Promise.reject(this.broken);
    const id = this.next++;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.send({ id, method, params }); });
  }
  notify(method: string): void { this.send({ method }); }
  close(): void { this.fail(new ReadFailure("the read was closed")); }
  private send(message: Record<string, unknown>): void {
    if (!this.child.write) { this.fail(new ReadFailure("the process has no input")); return; }
    const text = JSON.stringify(this.framed ? { jsonrpc: "2.0", ...message } : message);
    this.child.write(this.framed ? `Content-Length: ${Buffer.byteLength(text)}\r\n\r\n${text}` : `${text}\n`);
  }
  private receive(text: string): void {
    if (this.broken) return;
    this.buffer = Buffer.concat([this.buffer, Buffer.from(text, "utf8")]);
    if (this.buffer.length > OUTPUT_LIMIT) { this.fail(new ReadFailure("the process wrote too much output")); return; }
    for (;;) {
      let body: Buffer;
      if (this.framed) {
        const head = this.buffer.indexOf("\r\n\r\n");
        if (head < 0) return;
        const length = Number(/Content-Length: *(\d+)/i.exec(this.buffer.subarray(0, head).toString("latin1"))?.[1]);
        if (!Number.isSafeInteger(length)) { this.fail(new ReadFailure("the process broke the protocol")); return; }
        if (this.buffer.length < head + 4 + length) return;
        body = this.buffer.subarray(head + 4, head + 4 + length); this.buffer = this.buffer.subarray(head + 4 + length);
      } else {
        const end = this.buffer.indexOf(10);
        if (end < 0) return;
        body = this.buffer.subarray(0, end); this.buffer = this.buffer.subarray(end + 1);
        if (!body.toString("utf8").trim()) continue;
      }
      let message: unknown;
      // A parse error quotes its input.
      try { message = JSON.parse(body.toString("utf8")); } catch { this.fail(new ReadFailure("the process broke the protocol")); return; }
      if (typeof message !== "object" || message === null || "method" in message || !("id" in message)) continue;
      const reply = message as { id: unknown; result?: unknown; error?: unknown };
      const waiting = typeof reply.id === "number" ? this.pending.get(reply.id) : undefined;
      if (!waiting) continue;
      this.pending.delete(reply.id as number);
      if (reply.error !== undefined) {
        const error = typeof reply.error === "object" && reply.error !== null ? reply.error as { code?: unknown; message?: unknown } : {};
        waiting.reject(new RpcFailure(error.code, typeof error.message === "string" ? error.message : ""));
      } else waiting.resolve(reply.result);
    }
  }
  private fail(error: Error): void {
    if (this.broken) return;
    this.broken = error;
    for (const waiting of this.pending.values()) waiting.reject(error);
    this.pending.clear();
  }
}

interface RpcPlan { args: string[]; cwd: string; framed: boolean; open: [string, unknown]; initialized: boolean; read: [string, unknown] }
async function rpcRead(lease: Pick<Lease, "command" | "env">, options: UsageReadOptions, signal: AbortSignal | undefined, plan: RpcPlan): Promise<unknown> {
  const child = options.spawn(lease.command, plan.args, { cwd: plan.cwd, env: lease.env, input: true });
  const rpc = new StdioRpc(child, plan.framed), stop = stopped(signal);
  const exchange = async () => {
    await within(rpc.request(...plan.open), options.openMs ?? USAGE_OPEN_MS, plan.open[0]);
    if (plan.initialized) rpc.notify("initialized");
    return within(rpc.request(...plan.read), options.readMs ?? USAGE_READ_MS, plan.read[0]);
  };
  const exited = child.exit.then(() => { throw new ReadFailure("the process exited before answering"); });
  exited.catch(() => {});
  try { return await Promise.race([exchange(), exited, stop.promise]); }
  finally { stop.dispose(); rpc.close(); child.stop(); await child.gone; }
}

// The SDK's Query on a session that sends no prompt: initialize, then the usage control request, then close. The cwd
// is Doan's empty folder, not a repo, whose settings (an apiKeyHelper) could replace the login.
async function claudeRead(lease: Pick<Lease, "command" | "env"> & { organization?: string }, options: UsageReadOptions, signal: AbortSignal | undefined): Promise<unknown> {
  const controller = new AbortController(), stop = stopped(signal);
  let group: OwnedGroup | undefined, gone: Promise<void> = Promise.resolve();
  async function* idle() { await new Promise(resolve => { if (controller.signal.aborted) resolve(null); else controller.signal.addEventListener("abort", resolve, { once: true }); }); }
  const q = query({ prompt: idle(), options: {
    cwd: options.probeDir, env: lease.env, pathToClaudeCodeExecutable: lease.command, settingSources: ["user", "project", "local"], abortController: controller,
    // The login's organization pinned as a Doan Claude run pins it (runners.ts): a device's managed apiKeyHelper then
    // makes Claude Code refuse (read_failed) instead of reading an API key's usage as "no usage limits".
    ...(lease.organization ? { managedSettings: { forceLoginOrgUUID: lease.organization } } : {}),
    spawnClaudeCodeProcess(spawned) {
      const child = spawnChild(spawned.command, spawned.args, { cwd: spawned.cwd, env: spawned.env, detached: true, stdio: ["pipe", "pipe", "pipe"] });
      let release!: () => void;
      gone = new Promise(resolve => { release = resolve; });
      if (child.pid) group = new OwnedGroup(child.pid, undefined, undefined, release); else release();
      child.stderr.resume();
      child.once("exit", () => group?.childExited());
      child.once("error", () => { if (group) group.childExited(); else release(); });
      return child;
    },
  } });
  const exchange = async () => {
    await within(q.initializationResult(), options.openMs ?? USAGE_OPEN_MS, "initialize");
    return within(q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true }), options.readMs ?? USAGE_READ_MS, "the usage request");
  };
  try { return await Promise.race([exchange(), stop.promise]); }
  finally { stop.dispose(); controller.abort(); await group?.stop(); await gone; }
}

// The access token of the lease's working copy, read into this call only: never stored, logged, refreshed or returned.
function cursorCookie(profileDir: string): string {
  const path = join(profileDir, PROVIDER_AUTH.cursor.vault![0]!);
  let bytes: Buffer;
  try {
    // A link would let the read send another file's contents.
    const info = lstatSync(path);
    if (!info.isFile() || info.size > CURSOR_FILE_LIMIT) throw new ReadFailure("the credential file is not one Doan reads");
    bytes = readFileSync(path);
  } catch (error) { throw error instanceof ReadFailure ? error : new ReadFailure("the credential file could not be read"); }
  let token: unknown, sub: unknown;
  try {
    token = (JSON.parse(bytes.toString("utf8")) as { accessToken?: unknown }).accessToken;
    const parts = typeof token === "string" ? token.split(".") : [];
    sub = parts.length === 3 ? (JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as { sub?: unknown }).sub : undefined;
  } catch { throw new ReadFailure("the credential file is not one Doan reads"); }
  if (typeof token !== "string" || typeof sub !== "string" || !sub) throw new ReadFailure("the credential file is not one Doan reads");
  return `WorkosCursorSessionToken=${encodeURIComponent(sub)}%3A%3A${token}`;
}
async function cursorRead(lease: Pick<Lease, "profileDir">, options: UsageReadOptions, signal: AbortSignal | undefined): Promise<unknown> {
  const cookie = cursorCookie(lease.profileDir);
  const controller = new AbortController(), abort = () => controller.abort();
  if (signal?.aborted) throw new Stopped();
  signal?.addEventListener("abort", abort, { once: true });
  const limit = options.readMs ?? USAGE_READ_MS, timer = setTimeout(abort, limit);
  try {
    const fetch = options.fetch ?? globalThis.fetch;
    let reply: Response;
    // Headers as Orca 1.4.240 sends them and the PoC (U5) answered with.
    try { reply = await fetch(CURSOR_USAGE_URL, { method: "GET", headers: { Cookie: cookie, Accept: "application/json", Origin: CURSOR_ORIGIN, Referer: `${CURSOR_ORIGIN}/dashboard` }, redirect: "error", credentials: "omit", signal: controller.signal }); }
    catch { throw signal?.aborted ? new Stopped() : new ReadFailure(controller.signal.aborted ? `no answer within ${limit} ms` : "the request could not be completed"); }
    if (reply.redirected || (reply.url && new URL(reply.url).origin !== CURSOR_ORIGIN)) throw new ReadFailure("the answer came from another address");
    if (reply.status !== 200) throw new ReadFailure(`the request answered ${reply.status}`);
    const text = await limitedText(reply, controller.signal);
    try { return JSON.parse(text); } catch { throw new ReadFailure("the answer was not JSON"); }
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
async function limitedText(reply: Response, signal: AbortSignal): Promise<string> {
  if (!reply.body) return "";
  const reader = reply.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      if (signal.aborted) throw new ReadFailure("the answer did not arrive in time");
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > CURSOR_BODY_LIMIT) throw new ReadFailure("the answer was larger than Doan reads");
      chunks.push(value);
    }
  } catch (error) { void reader.cancel().catch(() => {}); throw error instanceof ReadFailure ? error : new ReadFailure("the answer could not be read"); }
  return Buffer.concat(chunks).toString("utf8");
}
