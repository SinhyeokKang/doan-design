import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas } from "../main/conversation/types";
import { conversationWork } from "./conversationList";
import type { Slot } from "./homeConversations";

// When the canvas page's conversation panel opens, where focus goes, the Show conversation dot and the work capsule's
// action.

// notification: a system notification or a toast; permission when it is about a permission request.
// agent: the agent's own turn start, permission request or turn end, which never open the panel.
export type PanelTrigger =
  | { kind: "overviewRow" } | { kind: "notification"; permission: boolean } | { kind: "promotion" } | { kind: "capsule" }
  | { kind: "sidebarRow" } | { kind: "picker" } | { kind: "newConversation" } | { kind: "agent" }
  // A started handoff's move: focus goes to the receiving thread's handoff card.
  | { kind: "handoff" };

// keep: the panel stays as it was. Opening focuses the first choice of the waiting request, else the composer.
export type PanelOpen = { open: "keep" } | { open: true; focus: PanelFocus };
export type PanelFocus = "permission" | "composer" | "handoff";
// Where focus goes once the panel shows what an entry asked for; each entry has its own seq. A handoff's names the
// receiving conversation, which the panel shows only after the render that brings the arrival.
export interface PanelArrival { focus: PanelFocus; seq: number; handoff?: { root: string; canvas: Canvas; conversationId: string } }

// `slot` is the canvas's sidebar slot, which the sidebar row reads.
export function panelOpenFor(trigger: PanelTrigger, slot: Slot["kind"] | null): PanelOpen {
  switch (trigger.kind) {
    case "agent": return { open: "keep" };
    // The capsule offers Open only while the agent waits for an answer.
    case "capsule": return { open: true, focus: "permission" };
    case "notification": return { open: true, focus: trigger.permission ? "permission" : "composer" };
    case "handoff": return { open: true, focus: "handoff" };
    // Working or no mark: the indicator already says so, and the panel keeps its last state.
    case "sidebarRow":
      if (slot === "permission") return { open: true, focus: "permission" };
      return slot === "unseen" ? { open: true, focus: "composer" } : { open: "keep" };
    default: return { open: true, focus: "composer" };
  }
}

export interface OpenBadge { kind: "permission" | "unseen"; label: string }

// The dot on a folded panel's Show conversation, from the sidebar slot's own rule so the two agree. Working has none:
// the canvas indicator shows it. `current` is the canvas's current conversation.
export function openButtonBadge(current: ConversationSummary | undefined, panelOpen: boolean, seen: ReadonlySet<string> = new Set()): OpenBadge | null {
  if (panelOpen || !current || current.state !== "current") return null;
  const work = conversationWork(current, seen);
  if (work?.kind === "permission") return { kind: "permission", label: "Show conversation, needs your answer" };
  if (work?.kind === "unseen") return { kind: "unseen", label: "Show conversation, new activity" };
  return null;
}

// The work capsule stops a working turn; while the agent waits for an answer it offers Open, and stopping is the
// permission card's Stop.
export function capsuleAction(phase: "running" | "waiting"): "stop" | "open" {
  return phase === "waiting" ? "open" : "stop";
}
