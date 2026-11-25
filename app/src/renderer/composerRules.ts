// Measurements and focus are the host's; these functions only decide.

export type ComposerShape = "capsule" | "box";
export interface ShapeInput {
  // Whitespace counts as text: the person typed it.
  empty: boolean;
  chips: number;
  // Measured by the host.
  overflows: boolean;
}

// A box does not return to a capsule when its text fits one line again: the capsule's field is narrower, so the shape
// would flip back and forth while typing.
export function composerShape(previous: ComposerShape, input: ShapeInput): ComposerShape {
  if (input.chips > 0 || input.overflows) return "box";
  if (input.empty) return "capsule";
  return previous;
}

export type ComposerAction = "send" | "stop" | "queue";
// holding: the turn ended and main still works on the conversation, so there is no turn to stop.
export type ComposerTurn = "idle" | "running" | "waiting" | "holding";

// `request` is composed, so a chip alone counts as content. While holding, Stop shows only while queue rows wait, since
// it returns them as a draft. limited: a message waits for the usage limit's reset, so the idle slot is Queue.
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
  | { kind: "answered"; requestId: string }
  | { kind: "stopped" }
  // Also when the "Replace your draft?" dialog closed either way.
  | { kind: "restored" }
  | { kind: "draftDialog" }
  | { kind: "sent" };
export type FocusTarget = { kind: "option"; requestId: string } | { kind: "field"; caretAtEnd: boolean };

// The answered request may still be in `pending` until main's resolution arrives.
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
