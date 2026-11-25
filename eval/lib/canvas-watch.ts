import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, rmSync, watch, writeFileSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const CANVAS_DIRS = [".doan/canvases/", ".doan/ds/"];
// How long a marker's own report may take; past it the log records an error, so the checks treat the names as unknown.
const MARK_TIMEOUT_MS = 10_000;
const MARK_RETRY_MS = 200;
const STOP_GRACE_MS = 2000;

export async function settlesWithin(promise: Promise<void>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), ms); });
  try { return await Promise.race([promise.then(() => true), timeout]); } finally { clearTimeout(timer); }
}

// Logs names the OS reports under the canvas dirs (null: unnamed; {error}: failed), as a transient file leaves no
// other trace. One process per watch: libuv rebuilds its shared FSEvents stream and a new watch loses reports.
export async function watchCanvasDirs(repo: string, log: string): Promise<{ stop(): Promise<void> }> {
  writeFileSync(log, "", { mode: 0o600 });
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), repo, log], { stdio: ["pipe", "pipe", "inherit"] });
  const exited = new Promise<void>(resolve => child.once("exit", () => resolve()));
  // Ending stdin of a child that is already gone fails with EPIPE.
  child.stdin.on("error", () => undefined);
  const ready = await new Promise<boolean>(resolve => {
    child.stdout.once("data", () => resolve(true));
    void exited.then(() => resolve(false));
  });
  if (!ready) appendFileSync(log, `${JSON.stringify({ error: "the watch process exited before it started" })}\n`);
  let stopped = false;
  return {
    async stop() {
      if (stopped) return;
      stopped = true;
      child.stdin.end();
      // The end marker may take MARK_TIMEOUT_MS; past that the child is stuck and the run's disposal must go on
      // (POSTMORTEM 2026-10-23).
      if (await settlesWithin(exited, MARK_TIMEOUT_MS + STOP_GRACE_MS)) return;
      appendFileSync(log, `${JSON.stringify({ error: "the watch process did not stop" })}\n`);
      child.kill("SIGKILL");
      await settlesWithin(exited, STOP_GRACE_MS);
    },
  };
}

// Reports arrive late (even for writes before the watch) but in order, so only those between a start and an end marker
// file are kept. Stops when stdin closes, also when the runner dies.
async function child(repo: string, log: string): Promise<void> {
  const record = (value: unknown) => appendFileSync(log, `${JSON.stringify(value)}\n`);
  let recording = false;
  let waiting: { names: Set<string>; seen(): void } | null = null;
  const watcher = watch(repo, { recursive: true }, (_event, name) => {
    const path = name === null ? null : name.split(sep).join("/");
    if (waiting && path !== null && waiting.names.has(path)) return waiting.seen();
    if (recording && (path === null || CANVAS_DIRS.some(dir => path.startsWith(dir)))) record(path);
  });
  watcher.on("error", error => record({ error: error.message }));
  // The stream starts after watch() returns, so a marker written too early is never reported: write a new one until one is.
  const mark = () => new Promise<void>(resolve => {
    const names = new Set<string>();
    const write = () => {
      const name = `.doan-eval-watch-${randomBytes(6).toString("hex")}`;
      names.add(name);
      try { writeFileSync(join(repo, name), ""); } catch (error) { record({ error: (error as Error).message }); done(); }
    };
    const retry = setInterval(write, MARK_RETRY_MS);
    const timer = setTimeout(() => { record({ error: "no report of a watch marker" }); done(); }, MARK_TIMEOUT_MS);
    const done = () => {
      clearInterval(retry);
      clearTimeout(timer);
      waiting = null;
      for (const name of names) rmSync(join(repo, name), { force: true });
      resolve();
    };
    waiting = { names, seen: done };
    write();
  });
  await mark();
  recording = true;
  process.stdout.write("ready\n");
  await new Promise<void>(resolve => { process.stdin.on("end", resolve).resume(); });
  await mark();
  watcher.close();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await child(process.argv[2]!, process.argv[3]!);

// The names in a watch log; null when the log is missing or records a failed watch, since then nothing is known.
export function readCanvasNames(text: string | null): (string | null)[] | null {
  if (text === null) return null;
  const names: (string | null)[] = [];
  for (const line of text.split("\n").filter(Boolean)) {
    const value: unknown = JSON.parse(line);
    if (value !== null && typeof value !== "string") return null;
    names.push(value);
  }
  return names;
}
