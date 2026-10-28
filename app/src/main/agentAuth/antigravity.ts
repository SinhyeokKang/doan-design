import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// Google's Antigravity ACP server, as distributed for the Zed and JetBrains extensions
// (https://antigravity.google/docs/ide/extensions). The release URL and hashes are not published by Google; they were
// read from Orca 1.4.240 and re-verified on download (B3, 2026-10-28). User decision 2026-10-28 (PRODUCT §7) accepts the
// download as an exception to "no CLI auto-install" and the undocumented AGY_ACP_FORCE_FILE_STORAGE switch.
export const ANTIGRAVITY_SERVER = {
  version: "1.3.0",
  url: "https://dl.google.com/agy-extensions/releases/macos/agy-acp-server-1.3.0-darwin-arm64.zip",
  archive: { sha256: "7cd97045f7b4fe81175a107cdf16f9c51484e3c78a5162cae415338bb6aa5b88", bytes: 111456962 },
  members: [
    { path: "agy_acp_server.par", sha256: "cb1f0725183ed922079ed6cd1d2422b4d8be44c5fb60be3e9a43d8d04f99a18e", bytes: 278535456 },
    { path: "localharness_external", sha256: "b04b00662c1821b953a409d43626b86d1229130eeb2078b4e1304c06199aa481", bytes: 118611392 },
  ],
} as const;
export const ANTIGRAVITY_COMMAND = "agy_acp_server.par";
// The server passes the sign-in link to $BROWSER (Python webbrowser). A command line with arguments is split only by
// some webbrowser paths (GenericBrowser(name) runs it as one executable name and fails), and a hook that fails makes
// webbrowser fall through to the user's default browser. An executable path runs as [path, url] on every path, may
// hold spaces (Application Support) but never ":" (the variable's separator), and the script always exits 0, so main
// alone decides where the link goes (user decision 2026-10-28).
export const AUTH_LINK_MARKER = "__DOAN_AUTH_URL__";
export const BROWSER_HOOK = { name: "browser-hook", script: `#!/bin/sh\nprintf '%s%s\\n' '${AUTH_LINK_MARKER}' "$1" >&2\nexit 0\n` } as const;
// Without a usable $BROWSER the server prints this line itself (credential_manager.py, 1.3.0).
const LINK_LINE = "Open the following link to authenticate the ACP server: ";

export interface SignInLink { url: string; redirect: URL; state: string }
// Only a Google OAuth request that returns to the server's own loopback listener is a sign-in link.
export function signInLink(line: string): SignInLink | null {
  const text = line.endsWith("\r") ? line.slice(0, -1) : line;
  const at = text.indexOf(AUTH_LINK_MARKER);
  const raw = at >= 0 ? text.slice(at + AUTH_LINK_MARKER.length) : text.startsWith(LINK_LINE) ? text.slice(LINK_LINE.length) : null;
  if (raw === null || raw.length > 16384 || /\s/.test(raw) || !URL.canParse(raw)) return null;
  const url = new URL(raw);
  const one = (name: string) => url.searchParams.getAll(name).length === 1 ? url.searchParams.get(name) ?? "" : "";
  const redirect = URL.canParse(one("redirect_uri")) ? new URL(one("redirect_uri")) : null;
  if (url.origin !== "https://accounts.google.com" || url.pathname !== "/o/oauth2/v2/auth" || url.username || url.password || url.hash ||
      one("response_type") !== "code" || !/^\S{1,512}$/.test(one("state")) || !redirect || !loopback(redirect)) return null;
  return { url: raw, redirect, state: one("state") };
}
function loopback(url: URL): boolean {
  const port = Number(url.port);
  return url.protocol === "http:" && url.hostname === "127.0.0.1" && Number.isInteger(port) && port >= 1024 && port <= 65535 && !url.username && !url.password;
}
// The browser normally reaches the loopback listener itself. When it cannot (another device, a blocked port), the
// user pastes the address the browser ended on; it must be the same listener and the same OAuth state.
export function callbackAddress(link: SignInLink, pasted: string): URL | null {
  const text = pasted.trim();
  if (!URL.canParse(text)) return null;
  const url = new URL(text);
  if (!loopback(url) || url.origin !== link.redirect.origin || url.pathname !== link.redirect.pathname || url.hash) return null;
  if (url.searchParams.getAll("state").length !== 1 || url.searchParams.get("state") !== link.state) return null;
  return url.searchParams.has("code") || url.searchParams.has("error") ? url : null;
}
export function forwardCallback(url: URL, timeoutMs = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const sent = request(url, { method: "GET", timeout: timeoutMs }, response => { response.resume(); response.once("end", () => resolve()); });
    sent.once("timeout", () => sent.destroy(new Error("The sign-in callback timed out")));
    sent.once("error", reject); sent.end();
  });
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}
async function verified(dir: string): Promise<boolean> {
  for (const member of ANTIGRAVITY_SERVER.members) {
    const path = join(dir, member.path);
    try { if (!statSync(path).isFile() || statSync(path).size !== member.bytes || await sha256(path) !== member.sha256) return false; } catch { return false; }
  }
  return true;
}
function unzip(archive: string, into: string): Promise<void> {
  return new Promise((resolve, reject) => execFile("/usr/bin/ditto", ["-x", "-k", archive, into], error => error ? reject(error) : resolve()));
}
export type Download = (url: string, signal: AbortSignal) => Promise<ReadableStream<Uint8Array>>;
const fetchBody: Download = async (url, signal) => {
  const response = await fetch(url, { signal });
  if (!response.ok || !response.body) throw new Error(`download failed: HTTP ${response.status}`);
  return response.body;
};
// Every install failure carries this code, so a conversation and the sign-in UI can tell it from a missing CLI.
export const INSTALL_FAILED = "cli_install_failed";
// The download may take minutes on a slow link, so only a stall ends it; a growing body cannot outlast the pinned size.
const STALL_MS = 30_000;
export interface InstallOptions { signal?: AbortSignal; download?: Download; stallMs?: number }
interface Install { promise: Promise<string>; controller: AbortController; waiters: number }
const installs = new Map<string, Install>();
// Returns the server's path under root/<version>, downloading and checking it first when needed. The archive and both
// members are verified by size and SHA-256 before the directory is renamed into place, and once per process after that.
// Callers share one install; a caller's signal ends only its wait, and the install stops when no caller is left.
export function antigravityServer(root: string, options: InstallOptions = {}): Promise<string> {
  const target = join(root, ANTIGRAVITY_SERVER.version);
  let install = installs.get(target);
  if (!install) {
    const controller = new AbortController();
    const created: Install = { controller, waiters: 0, promise: installServer(root, target, options.download ?? fetchBody, options.stallMs ?? STALL_MS, controller.signal) };
    installs.set(target, install = created);
    // A failed install is retried on the next call instead of being cached.
    created.promise.catch(() => { if (installs.get(target) === created) installs.delete(target); });
  }
  return wait(install, options.signal);
}
function wait(install: Install, signal: AbortSignal | undefined): Promise<string> {
  install.waiters += 1;
  return new Promise((resolve, reject) => {
    let waiting = true;
    const leave = (settle: () => void) => {
      if (!waiting) return;
      waiting = false; install.waiters -= 1; signal?.removeEventListener("abort", stop); settle();
    };
    const stop = () => leave(() => { if (install.waiters === 0) install.controller.abort(); reject(new Error("cancelled")); });
    if (signal?.aborted) { stop(); return; }
    signal?.addEventListener("abort", stop, { once: true });
    install.promise.then(path => leave(() => resolve(path)), error => leave(() => reject(error)));
  });
}
async function installServer(root: string, target: string, download: Download, stallMs: number, cancel: AbortSignal): Promise<string> {
  const stall = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const touch = () => { clearTimeout(timer); timer = setTimeout(() => stall.abort(new Error("the download stalled")), stallMs); };
  let work: string | null = null;
  try {
    if (existsSync(target)) {
      if (await verified(target)) return join(target, ANTIGRAVITY_COMMAND);
      rmSync(target, { recursive: true, force: true });
    }
    mkdirSync(root, { recursive: true, mode: 0o700 });
    work = join(root, `.install-${randomUUID()}`);
    mkdirSync(work, { mode: 0o700 });
    const archive = join(work, "server.zip"), signal = AbortSignal.any([cancel, stall.signal]);
    let received = 0;
    touch();
    const body = await download(ANTIGRAVITY_SERVER.url, signal);
    await pipeline(Readable.fromWeb(body as never), async function* (chunks: AsyncIterable<Buffer>) {
      for await (const chunk of chunks) {
        received += chunk.length;
        if (received > ANTIGRAVITY_SERVER.archive.bytes) throw new Error("The Antigravity server download is larger than its pinned size");
        touch(); yield chunk;
      }
    }, createWriteStream(archive, { mode: 0o600 }), { signal });
    clearTimeout(timer);
    if (statSync(archive).size !== ANTIGRAVITY_SERVER.archive.bytes || await sha256(archive) !== ANTIGRAVITY_SERVER.archive.sha256) throw new Error("The Antigravity server download does not match its pinned hash");
    const unpacked = join(work, "server");
    await unzip(archive, unpacked);
    if (!await verified(unpacked)) throw new Error("The Antigravity server archive does not hold the pinned files");
    renameSync(unpacked, target);
    return join(target, ANTIGRAVITY_COMMAND);
  } catch (error) {
    console.error("doan: the Antigravity server could not be installed", error instanceof Error ? error.message : String(error));
    throw new Error(INSTALL_FAILED);
  } finally {
    clearTimeout(timer);
    if (work) rmSync(work, { recursive: true, force: true });
  }
}
