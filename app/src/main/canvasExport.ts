import { randomUUID } from "node:crypto";
import { posix } from "node:path";
import type { CliRun } from "./folderState";
import { trashRequest, trashTarget } from "./canvasTrash";
import type { FolderEntry } from "./view";

// Export (canvas-row-menu, `canvas:export`): the save panel, then `doan export` through the bundled CLI. The renderer
// names a listed row only; main picks the file through the panel and keeps the path it wrote.

// What the renderer needs for its toasts, nothing more (the CLI's absolute output path stays in main):
// - `exported`: `external` is how many internet URLs the file still loads; `reveal` is an opaque id for
//   `canvas:revealExport` (Show in Finder), valid only for a file main itself just wrote.
// - `failed` `refused`: `count` references Doan can't include, `first` the first one as the CLI wrote it (no absolute
//   path, design 'CLI 명령' 5). `unreadable`: refused with no reference (the canvas doesn't parse or has no valid
//   `doan:width`). `tooLarge`: over 50 MiB, `largest` the biggest asset's repo-relative path when the CLI named one.
//   `insideDoan`: the chosen folder is inside a `.doan` directory. `failed`: anything else (no CLI, a crash, a timeout,
//   output that is not an envelope, a write failure).
// - `refused`: `notListed` for a root or row main does not list; `exporting` while an export of the same canvas runs.
export type ExportReply =
  | { kind: "cancelled" }
  | { kind: "exported"; external: number; reveal: string }
  | { kind: "failed"; reason: "refused"; count: number; first: string }
  | { kind: "failed"; reason: "tooLarge"; largest: string | null }
  | { kind: "failed"; reason: "unreadable" | "insideDoan" | "failed" }
  | { kind: "refused"; reason: "notListed" | "exporting" };
export type ExportOutcome = Exclude<ExportReply, { kind: "cancelled" | "refused" | "exported" }> | { kind: "exported"; external: number };

export const EXPORT_REFUSED: ExportReply = { kind: "refused", reason: "notListed" };

// The save panel's suggested name: the file stem, never the canvas `<title>` (the viewer and sidebar use the stem).
export function exportName(path: string): string {
  const name = posix.basename(path);
  const stem = name.toLowerCase().endsWith(".html") ? name.slice(0, -".html".length) : name;
  return `${stem || name}.html`;
}

// The CLI lists references (export_refused) and assets (export_too_large) one per line as `- <item>: <detail>`, the
// detail never containing ": " (contract with `cli/internal/cli/export.go`). Other lines are prose.
function listed(message: string): string[] {
  return message.split("\n").filter(line => line.startsWith("- ")).map(line => {
    const item = line.slice(2), cut = item.lastIndexOf(": ");
    return cut > 0 ? item.slice(0, cut) : item;
  });
}

const insideDoan = (output: string) => posix.dirname(output).split("/").includes(".doan");

// One `doan export` run read as the renderer's outcome. `output` is the file main asked the CLI to write.
export function interpretExport(run: CliRun, output: string): ExportOutcome {
  let value: unknown;
  try { value = JSON.parse(run.stdout); } catch { return { kind: "failed", reason: "failed" }; }
  if (typeof value !== "object" || value === null || Reflect.get(value, "v") !== 1) return { kind: "failed", reason: "failed" };
  if (Reflect.get(value, "ok") === true && run.exitCode === 0) {
    const result: unknown = Reflect.get(value, "result");
    const external: unknown = typeof result === "object" && result !== null ? Reflect.get(result, "external") : undefined;
    return { kind: "exported", external: Array.isArray(external) ? external.filter(url => typeof url === "string").length : 0 };
  }
  const error: unknown = Reflect.get(value, "error");
  const code: unknown = typeof error === "object" && error !== null ? Reflect.get(error, "code") : undefined;
  const message: unknown = typeof error === "object" && error !== null ? Reflect.get(error, "message") : undefined;
  const lines = typeof message === "string" ? listed(message) : [];
  switch (code) {
    case "export_refused": return lines[0] === undefined ? { kind: "failed", reason: "unreadable" } : { kind: "failed", reason: "refused", count: lines.length, first: lines[0] };
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
  // Electron's shell.showItemInFolder.
  reveal(path: string): void;
}

export interface CanvasExport {
  export(value: unknown): Promise<ExportReply>;
  reveal(value: unknown): void;
}

// Show in Finder ids of recent exports; an older toast's button does nothing.
const REVEAL_LIMIT = 16;

export function createCanvasExport(deps: CanvasExportDeps): CanvasExport {
  // Held from the request through the panel and the CLI run, per root and path.
  const exporting = new Set<string>();
  const written = new Map<string, string>();

  return {
    async export(value) {
      // Checks 1 and 2 of Move to Trash: a registered root whose list holds this exact canvas path.
      const request = trashRequest(value);
      if (request === null) return EXPORT_REFUSED;
      const target = trashTarget(deps.entries(), request);
      if ("kind" in target) return EXPORT_REFUSED;
      const key = `${target.root}\n${target.path}`;
      if (exporting.has(key)) return { kind: "refused", reason: "exporting" };
      exporting.add(key);
      try {
        const output = await deps.choose(exportName(target.path));
        if (output === null) return { kind: "cancelled" };
        deps.running(target.root, target.path);
        const outcome = interpretExport(await deps.run(target.root, target.path, output), output);
        if (outcome.kind !== "exported") return outcome;
        const reveal = randomUUID();
        written.set(reveal, output);
        for (const old of written.keys()) if (written.size > REVEAL_LIMIT) written.delete(old);
        return { ...outcome, reveal };
      } catch {
        return { kind: "failed", reason: "failed" };
      } finally {
        exporting.delete(key);
      }
    },
    reveal(value) {
      const path = typeof value === "string" ? written.get(value) : undefined;
      if (path !== undefined) deps.reveal(path);
    },
  };
}
