// Rules shared by the Home (hero) and docked composers (buzz-conversation design §3.1, §3.2). Measurements and focus
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

// The Send slot while a turn runs (spec decision 9): Stop while the field is empty, Queue once there is something to
// send. `request` is the composed request (homeComposer's composeRequest), so a chip alone counts as content. Queued
// messages do not change the slot: an empty field still offers Stop.
export function composerAction(running: boolean, request: string, _queued: number): ComposerAction {
  if (!running) return "send";
  return request.trim() === "" ? "stop" : "queue";
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

// Where focus goes after each action (design §3.1). `pending` lists the permission requests still waiting, in the
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
