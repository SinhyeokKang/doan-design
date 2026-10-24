import type { FolderEntry } from "../main/view";

export type DetailPart = string | { code: string };

export interface ProjectRow {
  status?: "Error" | "CLI error" | "Not found" | "Not initialized";
  hint?: "Reading…" | "No canvases";
  detail?: DetailPart[];
  actions: ("reopen" | "setup" | "copyPrompt" | "close")[];
}

export function projectRow(entry: FolderEntry): ProjectRow {
  switch (entry.kind) {
    case "loading":
      return { hint: "Reading…", actions: ["close"] };
    case "list":
      return entry.canvases.length === 0 ? { hint: "No canvases", actions: ["copyPrompt", "close"] } : { actions: ["close"] };
    case "uninitialized":
      return { status: "Not initialized", detail: ["Set up this project to add design/ and .doan/."], actions: ["setup", "close"] };
    case "error":
      return { status: "Error", detail: [entry.message], actions: ["close"] };
    case "cliError":
      return { status: "CLI error", ...(entry.reason ? { detail: [entry.reason.charAt(0).toUpperCase() + entry.reason.slice(1)] } : {}), actions: ["reopen", "close"] };
    case "notFound":
      return { status: "Not found", detail: [`${entry.path} is gone or moved. Restore it and Reopen, or Close it.`], actions: ["reopen", "close"] };
  }
}

export function projectNames(paths: readonly string[]): Map<string, string> {
  const parts = (path: string) => path.split("/").filter(Boolean);
  const basename = (path: string) => parts(path).at(-1) ?? path;
  const counts = new Map<string, number>();
  for (const path of paths) counts.set(basename(path), (counts.get(basename(path)) ?? 0) + 1);
  return new Map(paths.map((path) => [path, (counts.get(basename(path)) ?? 0) > 1 ? parts(path).slice(-2).join("/") : basename(path)]));
}

export function canvasName(path: string): string {
  return path.startsWith("design/") ? path.slice("design/".length) : path;
}
