import type { RevealPayload } from "../../main/prototype/ipc";
import type { FolderEntry } from "../../main/view";
import { CanvasConversation } from "../CanvasConversationPanel";
import { canvasUnlistedText, DUPLICATE_CANVAS_TEXT } from "../canvasConversation";
import type { PrototypeConversationCalls, PrototypeConversationRun } from "./conversationRun";

// The prototype window's conversation panel: the canvas panel's headless body on the playing canvas's current
// conversation. Its thread chips, Sign in and Open buttons belong to the main window: they go to main as a reveal,
// which brings the main window forward to act there; this window waits for nothing back.

export function PrototypeConversationPanel({ run, calls, now, onNotice = () => {} }: {
  run: PrototypeConversationRun; calls: PrototypeConversationCalls; now: number; onNotice?(text: string): void;
}) {
  const view = run.currentView(), target = run.target();
  if (!view || !target) return null;
  // The sidebar names a project by its folder; this window has no sidebar list to ask.
  const project = view.root.split("/").filter(Boolean).at(-1) ?? view.root;
  const entry: FolderEntry = run.entry() ?? { path: view.root, kind: "loading" };
  const settings = run.settings();
  const blocked = target.lost === "gone" ? canvasUnlistedText(project) : target.lost === "duplicate" ? DUPLICATE_CANVAS_TEXT : null;
  const reveal = (request: RevealPayload) => { void calls.reveal(request).catch(console.error); };
  // A chip names the conversation it was sent in; in the new conversation state there is none for main to check.
  const shownId = () => { const shown = run.run.view(); return shown?.kind === "conversation" ? shown.conversationId : null; };
  return <CanvasConversation calls={run.bodyCalls} run={run.run} support={run.support} target={target} canvasName={view.canvas} project={project}
    entry={entry} list={run.list()} seen={run.seen()} prefs={settings?.home ?? null} defaults={settings ? settings.newConversation : undefined}
    onRemember={choice => { void calls.rememberChoice(choice).catch(console.error); }}
    now={now} blocked={blocked} frames={view.frames} locateDisabled={false} arrival={null} onArrived={() => {}}
    onLocate={async anchor => {
      const conversationId = shownId();
      if (conversationId === null) return "unavailable";
      reveal({ kind: "chip", conversationId, anchor });
      return "shown";
    }}
    onReplyChip={async link => {
      const conversationId = shownId();
      if (conversationId !== null) reveal({ kind: "reply", conversationId, link });
      return null;
    }}
    // Sign in names its provider; "Sign in to an agent…" and "Manage agents…" open Settings > Agents at its top.
    onSettings={settingsTarget => reveal({ kind: "settings", ...(settingsTarget.provider ? { provider: settingsTarget.provider } : {}) })}
    onNotice={onNotice}
    onOpenProjectConversation={conversationId => reveal({ kind: "conversation", conversationId })}
    onOpenPromoted={conversationId => reveal({ kind: "conversation", conversationId })}
    onOpenHandoff={(canvas, conversationId) => reveal({ kind: "handoff", canvas, ...(conversationId ? { conversationId } : {}) })}
    work={run.work()} playing={run.playing()} listFailed={run.shown().kind === "list_error"} newFromRefusal={false} />;
}
