// Rules shared by the Home (hero) and docked composers. Measurements and focus
// are the host's; these functions only decide.

export type ComposerShape = "capsule" | "box";
export interface ShapeInput {
  // The draft's text is empty (whitespace counts as text: the person typed it).
  empty: boolean;
  chips: number;
  // The text needs more than one line at the capsule's field width, measured by the host.
  overflows: boolean;
}

// Chips or a wrapped line make a box; only a draft with neither text nor chips goes back to a capsule. A box does not
// return to a capsule when its text fits one line again: the capsule's field is narrower, so the same text would wrap
// there and the shape would flip back and forth while typing.
export function composerShape(previous: ComposerShape, input: ShapeInput): ComposerShape {
  if (input.chips > 0 || input.overflows) return "box";
  if (input.empty) return "capsule";
  return previous;
}

export type ComposerAction = "send" | "stop" | "queue";
// A conversation's turn as its composer reads it (dockedRules composerTurn). holding: the turn ended and main still
// works on the conversation (a project turn's judgement, a handoff's, a queue going out), so there is no turn to stop.
export type ComposerTurn = "idle" | "running" | "waiting" | "holding";

// The Send slot: Send while nothing runs; while a turn runs, Stop while the field is empty, Queue once there is
// something to send. `request` is the composed request (homeComposer's composeRequest), so a chip alone counts as
// content. Queued messages do not change a running turn's slot. While holding, text still queues, and Stop shows only
// while queue rows wait (`queueRows`: the rows drawn, those going out included), since it returns them as a draft.
// limited: the conversation's Doan connection is at its usage limit, or its rows wait for the reset; a message then
// waits too, so the idle slot is Queue (disabled by the host while the field is empty, as Send is).
export function composerAction(turn: ComposerTurn, request: string, queueRows: number, limited = false): ComposerAction {
  if (turn === "idle") return limited ? "queue" : "send";
  if (request.trim() !== "") return "queue";
  return turn === "holding" && queueRows === 0 ? "send" : "stop";
}

export function steerAllPlan(input: { sendNow: boolean; rows: number; draft: boolean }): "enter" | "none" | { rows: boolean; draft: boolean } {
  if (!input.sendNow) return "enter";
  if (input.rows === 0 && !input.draft) return "none";
  return { rows: input.rows > 0, draft: input.draft };
}

export type FocusAction =
  // A permission answer was sent for this request.
  | { kind: "answered"; requestId: string }
  | { kind: "stopped" }
  // Edit and resend filled the composer, or the "Replace your draft?" dialog closed either way.
  | { kind: "restored" }
  | { kind: "draftDialog" }
  | { kind: "sent" };
export type FocusTarget = { kind: "option"; requestId: string } | { kind: "field"; caretAtEnd: boolean };

// Where focus goes after each action. `pending` lists the permission requests still waiting, in the
// order they arrived; the answered one may still be in it until main's resolution arrives.
export function focusAfter(action: FocusAction, state: { pending: readonly string[] }): FocusTarget {
  switch (action.kind) {
    case "answered": {
      const next = state.pending.find(requestId => requestId !== action.requestId);
      return next ? { kind: "option", requestId: next } : { kind: "field", caretAtEnd: false };
    }
    case "restored": case "draftDialog": return { kind: "field", caretAtEnd: true };
    case "stopped": case "sent": return { kind: "field", caretAtEnd: false };
  }
}
