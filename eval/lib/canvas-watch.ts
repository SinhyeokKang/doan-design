import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, rmSync, watch, writeFileSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const CANVAS_DIRS = [".doan/canvases/", ".doan/ds/"];
// How long a marker's own report may take; past it the log records an error, so the checks treat the names as unknown.
const MARK_TIMEOUT_MS = 10_000;
const MARK_RETRY_MS = 200;

// Records every repo-relative name the OS reports under the canvas directories while the agent runs, one JSON value
// per line (null: an event without a name; {error}: the watch failed). A file that comes and goes before the checks,
// such as a copy made to render a variant, leaves no other trace, yet the app lists it as it lands.
// Each watch runs in a process of its own: libuv on macOS serves every recursive watch of a process from one FSEvents
// stream that it rebuilds whenever a watch opens or closes, and a watch opened in-process after another had closed
// missed its first report. The runner's two lanes open and close watches side by side.
export async function watchCanvasDirs(repo: string, log: string): Promise<{ stop(): Promise<void> }> {
  writeFileSync(log, "", { mode: 0o600 });
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), repo, log], { stdio: ["pipe", "pipe", "inherit"] });
  const exited = new Promise<void>(resolve => child.once("exit", () => resolve()));
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
      await exited;
    },
  };
}

// The child: reports arrive late and in order (macOS reports even writes made just before the watch started, and a
// write just before the agent exits arrives after its process does), so it writes a marker file at the repo root at
// each end and keeps only the reports between the two markers' own. It stops when its stdin closes, also when the
// runner dies.
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
