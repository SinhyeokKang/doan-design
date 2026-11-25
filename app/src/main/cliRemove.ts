import type { RemoveErrorCode, RemoveRequest, RemoveResponse } from "../formats/types";
import { groupProjects } from "../renderer/homeCards";
import type { LiveTurn } from "./conversationWork";
import { openBlockedMessage } from "./deepLinks";
import type { Screen } from "./menuState";
import type { FolderEntry } from "./view";

// Main judges with what it already holds and removes itself, so a refusal that says "nothing changed" can never be
// overtaken by a removal still landing (ARCHITECTURE §4 'Removing a project over app-socket v7').

export interface CliRemoveMenu { screen: Screen; modal: boolean; locked?: boolean; projectSettings?: boolean }
export interface CliRemoveInput {
  root: string;
  entries: readonly FolderEntry[];
  // The launch restore is applied, the first folders are in and no project is being read (index.ts openLinksReady).
  ready: boolean;
  // First run or the existing-user buddy screen is open.
  firstRun: boolean;
  // The main window's last menu state; one frame late at most, which reads as the menu's Remove pressed just before.
  menu: CliRemoveMenu;
  liveTurns: ReadonlyMap<string, LiveTurn>;
  // Roots with a start or send main has not accepted yet, or one waiting for its previous turn
  // (ConversationService.pendingRoots): running for the person, though liveTurns counts only accepted turns.
  pendingRoots: ReadonlySet<string>;
}
export type CliRemoveDecision = { kind: "refuse"; response: RemoveResponse } | { kind: "remove"; roots: string[]; project: string };

const NOT_OPEN = "The project is not open in Doan.";
const RUNNING = "A conversation is running in this project in Doan.";
const refuse = (code: Exclude<RemoveErrorCode, "bad_request" | "bad_token">, message: string): CliRemoveDecision => ({ kind: "refuse", response: { v: 7, ok: false, error: { code, message } } });

// The CLI has no confirmation, so any running turn in the group refuses. An app conversation's agent never gets here
// (ARCHITECTURE §4 'App-socket credentials').
export function cliRemoveDecision({ root, entries, ready, firstRun, menu, liveTurns, pendingRoots }: CliRemoveInput): CliRemoveDecision {
  const card = groupProjects(entries, new Map(entries.flatMap(entry => entry.lastCommon ? [[entry.path, entry.lastCommon]] : [])))
    .find(candidate => candidate.rows.some(row => row.path === root));
  if (!card) return refuse("project_not_open", NOT_OPEN);
  // What the person must finish is named before loading: loading ends by itself while these wait for the person, and a
  // locked Add Projects page is itself reading the root it sets up.
  if (firstRun) return refuse("busy", openBlockedMessage("first_run"));
  if (menu.modal) return refuse("busy", "A dialog is open in Doan. Close it, then try again.");
  if (menu.locked === true) {
    const page = menu.screen === "addProjects" ? "add_projects" : menu.projectSettings === true ? "project_settings" : "settings";
    return refuse("busy", openBlockedMessage(page));
  }
  // `ready` waits for every root, not only the group's: a just-added worktree has no Git common directory while it
  // loads, so the group cannot claim it yet and removing the group now would leave it listed.
  if (!ready || card.rows.some(row => row.kind === "loading")) return refuse("busy", "Doan is still loading a project. Try again shortly.");
  const roots = card.rows.map(row => row.path);
  for (const turn of liveTurns.values()) {
    if (turn.running && roots.includes(turn.root)) return refuse("conversation_running", RUNNING);
  }
  if (roots.some(at => pendingRoots.has(at))) return refuse("conversation_running", RUNNING);
  return { kind: "remove", roots, project: card.name };
}

export interface CliRemoveHost {
  ready(): boolean;
  firstRun(): boolean;
  entries(): readonly FolderEntry[];
  menu(): CliRemoveMenu;
  liveTurns(): ReadonlyMap<string, LiveTurn>;
  pendingRoots(): ReadonlySet<string>;
  // index.ts removeRoots, shared with the menu's Remove from Doan.
  removeRoots(roots: readonly string[]): Promise<{ kind: "removed"; paths: string[] } | { kind: "unavailable" }>;
}

// The whole answer to a v7 request whose schema, token and root passed (runtime.ts).
export async function answerCliRemove(request: RemoveRequest, host: CliRemoveHost): Promise<RemoveResponse> {
  const decision = cliRemoveDecision({ root: request.root, entries: host.entries(), ready: host.ready(), firstRun: host.firstRun(), menu: host.menu(), liveTurns: host.liveTurns(), pendingRoots: host.pendingRoots() });
  if (decision.kind === "refuse") return decision.response;
  const removed = await host.removeRoots(decision.roots);
  if (removed.kind === "unavailable") return { v: 7, ok: false, error: { code: "project_not_open", message: NOT_OPEN } };
  return { v: 7, ok: true, removed: true, project: decision.project, roots: removed.paths };
}
