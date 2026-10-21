export type Author =
  | { kind: "human"; name: string; email?: string }
  | { kind: "agent"; name: string };

export interface Target {
  frame?: string;
  element?: {
    doanId?: string;
    selector: string;
    html: string;
    text?: string;
    truncated?: boolean;
  };
}

interface EventBase {
  v: 1;
  id: string;
  at: string;
  comment: string;
  by: Author;
}

export type CommentEvent = EventBase & (
  | { type: "create"; body: string; canvasHash: string; target: Target }
  | { type: "edit"; body: string }
  | { type: "delete" | "resolve" | "reopen" }
);
