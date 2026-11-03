import { basename } from "node:path";
import { PROVIDER_NAMES } from "../renderer/agentAuthView";
import { cardRow, groupProjects } from "../renderer/homeCards";
import type { ConversationMetadata } from "./conversation/store";
import type { ConversationEvent } from "./conversation/types";
import { closesNotification, notificationFor, TEST_NOTIFICATION, type ConversationNames, type NotificationKind, type NotificationTarget, type WindowVisibility } from "./notifications";
import type { NotificationPreferences } from "./preferences";
import type { FolderEntry } from "./view";

// Sends the notifications notificationFor allows (buzz-settings design 'Notifications'). Electron stays in index.ts,
// which hands in a factory for its Notification.

export interface NotificationHandle {
  show(): void;
  close(): void;
  on(event: "click" | "close" | "show" | "failed", listener: (...args: unknown[]) => void): unknown;
}
export type TestNotificationReply = { kind: "sent" } | { kind: "failed" };

export interface NotifyDeps {
  preferences(): NotificationPreferences;
  visibility(): WindowVisibility;
  names(conversationId: string): ConversationNames | null;
  create(content: { title: string; body: string }): NotificationHandle;
  // null: the test notification, which only shows the window.
  clicked(target: NotificationTarget | null): void;
  log(message: string, detail?: unknown): void;
  // How long a test notification waits for macOS to say shown or refused before counting as sent.
  testTimeoutMs?: number;
}

// The provider a conversation runs on, its project named as Home names it, and the worktree's branch.
export function conversationNames(conversations: readonly ConversationMetadata[], entries: readonly FolderEntry[], conversationId: string): ConversationNames | null {
  const conversation = conversations.find(candidate => candidate.conversationId === conversationId);
  if (!conversation) return null;
  const { root } = conversation;
  const provider = PROVIDER_NAMES[conversation.owner.kind === "doan" ? conversation.owner.provider : conversation.session.runtime];
  const entry = entries.find(candidate => candidate.path === root);
  const card = entry && groupProjects(entries, new Map(entries.flatMap(e => e.lastCommon ? [[e.path, e.lastCommon]] : []))).find(c => c.rows.some(row => row.path === root));
  return { provider, root, project: card?.name ?? basename(root), branch: (entry && cardRow(entry, null, null).summary?.branch) ?? null };
}

export function createNotifyService(deps: NotifyDeps) {
  // One per conversation: macOS drops the click of a notification whose object was collected (P1).
  const held = new Map<string, { notification: NotificationHandle; kind: NotificationKind; requestId?: string }>();
  let test: NotificationHandle | null = null;

  const release = (conversationId: string, notification: NotificationHandle) => {
    if (held.get(conversationId)?.notification === notification) held.delete(conversationId);
  };

  return {
    event(event: ConversationEvent): void {
      const shown = held.get(event.conversationId);
      if (shown && closesNotification(event, shown)) {
        held.delete(event.conversationId);
        shown.notification.close();
      }
      const planned = notificationFor(event, deps.preferences(), deps.visibility(), deps.names(event.conversationId));
      if (planned === null) return;
      const notification = deps.create({ title: planned.title, body: planned.body });
      notification.on("click", () => { release(event.conversationId, notification); deps.clicked(planned.target); });
      notification.on("close", () => release(event.conversationId, notification));
      // Not allowed by macOS (a development build always is not, P1): logged only, the person is not asked again.
      notification.on("failed", (_event: unknown, error: unknown) => { release(event.conversationId, notification); deps.log("doan: macOS refused a notification", error); });
      // The newer one says what happened last; the older one would only lead to the same conversation.
      held.get(event.conversationId)?.notification.close();
      held.set(event.conversationId, { notification, kind: planned.kind, ...(planned.requestId === undefined ? {} : { requestId: planned.requestId }) });
      notification.show();
    },

    // A deleted conversation's notification has nothing left to lead to.
    close(conversationId: string): void {
      const shown = held.get(conversationId); if (!shown) return;
      held.delete(conversationId);
      shown.notification.close();
    },

    // Shown whatever the switches and focus say: the point is to see one now.
    test(): Promise<TestNotificationReply> {
      const notification = deps.create({ ...TEST_NOTIFICATION });
      test = notification;
      notification.on("click", () => { if (test === notification) test = null; deps.clicked(null); });
      return new Promise(resolve => {
        // macOS gives no permission state to read; an answer that never comes is reported as sent with the hint.
        const timer = setTimeout(() => resolve({ kind: "sent" }), deps.testTimeoutMs ?? 5000);
        notification.on("show", () => { clearTimeout(timer); resolve({ kind: "sent" }); });
        notification.on("failed", () => { clearTimeout(timer); if (test === notification) test = null; resolve({ kind: "failed" }); });
        notification.show();
      });
    },
  };
}

export type NotifyService = ReturnType<typeof createNotifyService>;
