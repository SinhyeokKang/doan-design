import { appendFileSync, watch, writeFileSync } from "node:fs";
import { sep } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const CANVAS_DIRS = [".doan/canvases/", ".doan/ds/"];
// fs.watch delivers events on the event loop after the OS reports them, so a write just before the agent exits arrives
// after its process does, and one just before the watch starts arrives after that. canvas-watch.test.ts pins both.
const SETTLE_MS = 1000;

// Records every repo-relative name the OS reports under the canvas directories while the agent runs, one JSON value
// per line (null: an event without a name; {error}: the watch failed). A file that comes and goes before the checks,
// such as a copy made to render a variant, leaves no other trace, yet the app lists or reloads on it as it lands.
// macOS also reports writes made just before the watch started, so it resolves only after their reports are dropped.
export async function watchCanvasDirs(repo: string, log: string): Promise<{ stop(): Promise<void> }> {
  writeFileSync(log, "", { mode: 0o600 });
  let started = false;
  const watcher = watch(repo, { recursive: true }, (_event, name) => {
    const path = name === null ? null : name.split(sep).join("/");
    if (started && (path === null || CANVAS_DIRS.some(dir => path.startsWith(dir)))) appendFileSync(log, `${JSON.stringify(path)}\n`);
  });
  watcher.on("error", error => appendFileSync(log, `${JSON.stringify({ error: error.message })}\n`));
  await sleep(SETTLE_MS);
  started = true;
  let stopped = false;
  return {
    async stop() {
      if (stopped) return;
      stopped = true;
      await sleep(SETTLE_MS);
      watcher.close();
    },
  };
}

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
