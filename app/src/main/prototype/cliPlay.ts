import { resolveOpenTarget } from "../deepLinks";
import type { FolderEntry } from "../view";
import type { PrototypeSize } from "./mark";
import { playTarget, type CliPlay } from "./requests";
import type { PrototypeTarget } from "./targets";

// `doan open <canvas> --frame <id> --prototype` (app-socket v6) once its schema, token and registered root passed.
// Unlike `doan open`, nothing here asks the main window: the prototype window plays apart from it, so its locked pages
// and dialogs do not block a play; only first run and the buddy screen do.

export type CliPlayErrorCode = "bad_request" | "bad_token" | "project_not_open" | "canvas_not_found" | "busy" | "not_ready";
export type CliPlayResponse = { v: 6; ok: true; played: true } | { v: 6; ok: false; error: { code: CliPlayErrorCode; message: string } };
export type CliPlayDecision = { kind: "refuse"; response: CliPlayResponse } | { kind: "play"; target: PrototypeTarget; size: PrototypeSize };

export function cliPlayError(code: CliPlayErrorCode, message: string): CliPlayResponse {
  return { v: 6, ok: false, error: { code, message } };
}

export const CLI_PLAY_NOT_FOUND = cliPlayError("canvas_not_found", "The canvas is not in the project's canvas list in Doan.");

const refuse = (response: CliPlayResponse): CliPlayDecision => ({ kind: "refuse", response });

// `ready`: the launch restore is applied and no project is being read (index.ts openLinksReady). The order is the
// CLI's retry rule: not_ready is retried, busy and canvas_not_found end the command.
export function cliPlayDecision({ ready, firstRun, entries, request }: { ready: boolean; firstRun: boolean; entries: readonly FolderEntry[]; request: CliPlay }): CliPlayDecision {
  const listed = resolveOpenTarget({ root: request.root, canvas: request.path }, entries);
  if (!ready) return refuse(cliPlayError("not_ready", "Doan is still starting. Try again shortly."));
  if (listed.kind === "loading") return refuse(cliPlayError("not_ready", "Doan is still reading this project. Try again shortly."));
  if (firstRun) return refuse(cliPlayError("busy", "Finish Doan's first run, then try again."));
  if (listed.kind === "unregistered-root") return refuse(cliPlayError("project_not_open", "The project is not open in Doan."));
  if (listed.kind === "canvas-not-listed") return refuse(CLI_PLAY_NOT_FOUND);
  const play = playTarget(request.root, request.path, request.frame, request.mark, entries);
  return play === null ? refuse(CLI_PLAY_NOT_FOUND) : { kind: "play", ...play };
}
