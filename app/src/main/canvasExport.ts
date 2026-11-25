import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { posix } from "node:path";
import type { CliRun } from "./folderState";
import { trashRequest, trashTarget } from "./canvasTrash";
import type { ExportTarget } from "./prototype/ipc";
import type { WindowKind } from "./senderAllowed";
import type { FolderEntry } from "./view";

// The renderer names a listed row only; main picks the file through the save panel and keeps the path it wrote.

// Only what the renderer's toasts need; the CLI's absolute output path stays in main. `reveal` is valid only for a
// file main itself just wrote; `first` and `largest` are repo-relative as the CLI wrote them.
export type ExportReply =
  | { kind: "cancelled" }
  | { kind: "exported"; external: number; linkedFrames?: number; reveal: string }
  | { kind: "failed"; reason: "refused"; count: number; first: string }
  | { kind: "failed"; reason: "tooLarge"; largest: string | null }
  | { kind: "failed"; reason: "unreadable" | "insideDoan" | "failed" | "notFound" | "notMarked" }
  | { kind: "refused"; reason: "notListed" | "exporting" | "changed" };
export type ExportOutcome = Exclude<ExportReply, { kind: "cancelled" | "refused" | "exported" }> | { kind: "exported"; external: number; linkedFrames?: number };

export const EXPORT_REFUSED: ExportReply = { kind: "refused", reason: "notListed" };

// The save panel's suggested name: the file stem, never the canvas `<title>` (the viewer and sidebar use the stem).
export function exportName(path: string): string {
  const name = posix.basename(path);
  const stem = name.toLowerCase().endsWith(".html") ? name.slice(0, -".html".length) : name;
  return `${stem || name}.html`;
}

// The prototype window's suggested name, `<canvas stem>-<frame id>.html`. A frame ID may hold characters a file name
// cannot (`/`) or that Finder shows as `/` (`:`), and control characters; each becomes a hyphen.
export function prototypeExportName(path: string, frame: string): string {
  const stem = exportName(path).slice(0, -".html".length);
  const name = posix.basename(path).toLowerCase() === ".html" ? frame : `${stem}-${frame}`;
  return `${name.replace(/[/:\u0000-\u001f\u007f]/g, "-")}.html`;
}

// The CLI lists items one per line as `- <item>: <detail>`, the detail never containing ": " (contract with
// `cli/internal/cli/export.go`). Other lines are prose.
function listed(message: string): string[] {
  return message.split("\n").filter(line => line.startsWith("- ")).map(line => {
    const item = line.slice(2), cut = item.lastIndexOf(": ");
    return cut > 0 ? item.slice(0, cut) : item;
  });
}

// Case-insensitive: on a case-insensitive disk `.DOAN` is the same directory.
const hasDoan = (dir: string) => dir.split("/").some(segment => segment.toLowerCase() === ".doan");
// As the CLI judges it (`UnderDoan`, cli/internal/export/target.go): by the output's folder as spelled or where it
// really leads, and by the spelling alone when it cannot be resolved.
function insideDoan(output: string): boolean {
  const dir = posix.dirname(output);
  if (hasDoan(dir)) return true;
  try { return hasDoan(realpathSync.native(dir)); } catch { return false; }
}

// `prototype`: the run had `--prototype`, so only a result that says so is the file asked for. A `linkedFrames` that is
// not a count reads as none: the file is written either way.
export function interpretExport(run: CliRun, output: string, prototype = false): ExportOutcome {
  let value: unknown;
  try { value = JSON.parse(run.stdout); } catch { return { kind: "failed", reason: "failed" }; }
  if (typeof value !== "object" || value === null || Reflect.get(value, "v") !== 1) return { kind: "failed", reason: "failed" };
  if (Reflect.get(value, "ok") === true && run.exitCode === 0) {
    const result: unknown = Reflect.get(value, "result");
    const external: unknown = typeof result === "object" && result !== null ? Reflect.get(result, "external") : undefined;
    const count = Array.isArray(external) ? external.filter(url => typeof url === "string").length : 0;
    if (!prototype) return { kind: "exported", external: count };
    if (typeof result !== "object" || result === null || Reflect.get(result, "prototype") !== true) return { kind: "failed", reason: "failed" };
    const linked: unknown = Reflect.get(result, "linkedFrames");
    return { kind: "exported", external: count, linkedFrames: Number.isSafeInteger(linked) && (linked as number) >= 0 ? linked as number : 0 };
  }
  const error: unknown = Reflect.get(value, "error");
  const code: unknown = typeof error === "object" && error !== null ? Reflect.get(error, "code") : undefined;
  const message: unknown = typeof error === "object" && error !== null ? Reflect.get(error, "message") : undefined;
  const lines = typeof message === "string" ? listed(message) : [];
  switch (code) {
    case "export_refused": return lines[0] === undefined ? { kind: "failed", reason: "unreadable" } : { kind: "failed", reason: "refused", count: lines.length, first: lines[0] };
    case "frame_not_found": return { kind: "failed", reason: "notFound" };
    case "not_prototype": return { kind: "failed", reason: "notMarked" };
    case "export_too_large": return { kind: "failed", reason: "tooLarge", largest: lines[0] ?? null };
    // The CLI refuses an output under `.doan` as a usage error; any other usage error is the app's own fault.
    case "usage_error": return insideDoan(output) ? { kind: "failed", reason: "insideDoan" } : { kind: "failed", reason: "failed" };
    default: return { kind: "failed", reason: "failed" };
  }
}

export interface CanvasExportDeps {
  entries(): readonly FolderEntry[];
  // The save panel with `name` as its default file name; null when the person cancelled.
  choose(name: string): Promise<string | null>;
  // The person chose a file and the CLI is about to run: the window starts its progress toast and disables the item.
  // Never sent for a cancelled panel or a refused request.
  running(root: string, path: string): void;
  run(root: string, path: string, output: string): Promise<CliRun>;
  reveal(path: string): void;
}

export interface CanvasExport {
  export(value: unknown): Promise<ExportReply>;
  reveal(value: unknown): void;
}

// A frame of a listed canvas row, for the prototype window's Export (prototype/ipc.ts).
export type { ExportTarget };

// Show in Finder ids of recent exports; an older toast's button does nothing.
const REVEAL_LIMIT = 16;

type Refusal = Extract<ExportReply, { kind: "refused" }>;

// The flow both exports share: a lock held from the request through the panel and the CLI run, then the Show in Finder
// id of a written file. Each instance has its own lock and ids.
function exportFlow(choose: (name: string) => Promise<string | null>, reveal: (path: string) => void) {
  const exporting = new Set<string>();
  const written = new Map<string, string>();
  return {
    async start(lock: string, name: string, running: () => void, attempt: (output: string) => Promise<ExportOutcome>): Promise<ExportReply> {
      if (exporting.has(lock)) return { kind: "refused", reason: "exporting" };
      exporting.add(lock);
      try {
        const output = await choose(name);
        if (output === null) return { kind: "cancelled" };
        running();
        const outcome = await attempt(output);
        if (outcome.kind !== "exported") return outcome;
        const id = randomUUID();
        written.set(id, output);
        for (const old of written.keys()) if (written.size > REVEAL_LIMIT) written.delete(old);
        return { ...outcome, reveal: id };
      } catch {
        return { kind: "failed", reason: "failed" };
      } finally {
        exporting.delete(lock);
      }
    },
    reveal(value: unknown) {
      const path = typeof value === "string" ? written.get(value) : undefined;
      if (path !== undefined) reveal(path);
    },
  };
}

export function createCanvasExport(deps: CanvasExportDeps): CanvasExport {
  const flow = exportFlow(deps.choose, deps.reveal);
  return {
    async export(value) {
      // Move to Trash's checks: a registered root whose list holds this exact canvas path.
      const request = trashRequest(value);
      if (request === null) return EXPORT_REFUSED;
      const target = trashTarget(deps.entries(), request);
      if ("kind" in target) return EXPORT_REFUSED;
      // Held per root and path.
      return flow.start(`${target.root}\n${target.path}`, exportName(target.path), () => deps.running(target.root, target.path),
        async output => interpretExport(await deps.run(target.root, target.path, output), output));
    },
    reveal: flow.reveal,
  };
}

export interface PrototypeExportDeps {
  // The clicked target if it is still the one playing (controller.exportTarget), else main's refusal.
  target(kind: WindowKind, value: unknown): ExportTarget | Refusal;
  // The save panel, a sheet of the prototype window; null when cancelled or the window is gone.
  choose(name: string): Promise<string | null>;
  running(target: ExportTarget): void;
  run(target: ExportTarget, output: string): Promise<CliRun>;
  reveal(path: string): void;
}

export interface PrototypeExport {
  export(kind: WindowKind, value: unknown): Promise<ExportReply>;
  reveal(value: unknown): void;
}

// The prototype window's Export: one export at a time for the window, whatever frame it plays meanwhile. Nothing here
// waits on the window, so one closed mid-run still gets its file written.
export function createPrototypeExport(deps: PrototypeExportDeps): PrototypeExport {
  const flow = exportFlow(deps.choose, deps.reveal);
  return {
    async export(kind, value) {
      const target = deps.target(kind, value);
      if ("kind" in target) return target;
      return flow.start("window", prototypeExportName(target.path, target.frame), () => deps.running(target),
        async output => interpretExport(await deps.run(target, output), output, true));
    },
    reveal: flow.reveal,
  };
}
