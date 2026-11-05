import type { ConversationEvent } from "./conversation/types";
import type { NotificationPreferences } from "./preferences";

// macOS notification rules (buzz-settings design 'Notifications'). Main decides whether and what to show; the
// renderer interprets a click with notificationTarget, the one function buzz-conversation replaces for its panel.
// No Electron here: the renderer imports this file.

export type NotificationKind = "approval" | "finished" | "failed";
// Composed rather than trusting focus alone: a hidden or minimized window, or a hidden app, is not in front even if
// Electron still reports it focused.
export interface WindowVisibility { focused: boolean; shown: boolean; minimized: boolean; appHidden: boolean }
export interface ConversationNames { provider: string; root: string; project: string; branch: string | null }
// What main sends the renderer on a click.
export interface NotificationTarget { conversationId: string; root: string }
export interface PlannedNotification { kind: NotificationKind; title: string; body: string; target: NotificationTarget; requestId?: string }
export type ClickDestination = { kind: "conversation"; conversationId: string; root: string } | { kind: "overview"; root: string } | { kind: "window" };

// The design names no copy for it; it says only that a notification looks like this.
export const TEST_NOTIFICATION = { title: "Test notification", body: "Doan notifies you like this when an agent needs you." } as const;

const TITLES: Record<NotificationKind, string> = { approval: "needs your approval", finished: "finished", failed: "couldn’t finish" };
const SWITCH: Record<NotificationKind, keyof NotificationPreferences> = { approval: "approval", finished: "finished", failed: "failed" };

// A turn the person stopped is `interrupted`, never `turn.failed`, so it never notifies. The permission summary is
// left out until PRODUCT §6 settles its format, and so is a question's sentence. A question follows the Approval
// requests switch but says it needs an answer, as the thread and the sidebar do (agent-questions design §6).
export function notificationFor(event: ConversationEvent, preferences: NotificationPreferences, visibility: WindowVisibility, names: ConversationNames | null): PlannedNotification | null {
  const asks = event.type === "permission.request" || event.type === "question.request";
  const kind: NotificationKind | null = asks ? "approval" : event.type === "turn.done" ? "finished" : event.type === "turn.failed" ? "failed" : null;
  if (kind === null || names === null || !preferences.enabled || !preferences[SWITCH[kind]]) return null;
  if (visibility.focused && visibility.shown && !visibility.minimized && !visibility.appHidden) return null;
  return {
    kind, title: `${names.provider} ${event.type === "question.request" ? "needs your answer" : TITLES[kind]}`, body: names.branch === null ? names.project : `${names.project} · ${names.branch}`,
    target: { conversationId: event.conversationId, root: names.root },
    ...(asks ? { requestId: event.requestId } : {}),
  };
}

// An approval notification goes when its request is answered, here or by the agent; a question's when it is answered,
// skipped or expired.
export function closesNotification(event: ConversationEvent, shown: { kind: NotificationKind; requestId?: string }): boolean {
  return shown.kind === "approval" && (event.type === "permission.resolved" || event.type === "question.resolved") && event.requestId === shown.requestId;
}

// `known`: the renderer has the conversation. `registered`: its root is still a saved project. `locked`: a page lock
// or a modal, where only the window comes forward and the permission toast's Open stays the way in.
export function notificationTarget(click: NotificationTarget, known: boolean, registered: boolean, locked: boolean): ClickDestination {
  if (locked) return { kind: "window" };
  if (known) return { kind: "conversation", conversationId: click.conversationId, root: click.root };
  return registered ? { kind: "overview", root: click.root } : { kind: "window" };
}
