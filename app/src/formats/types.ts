export type Author =
  | { kind: "human"; name: string; email?: string }
  | { kind: "agent"; name: string };

export interface SelectionElement {
  doanId?: string;
  selector: string;
  html: string;
  text?: string;
  truncated?: boolean;
}

export interface Target {
  frame?: string;
  element?: SelectionElement;
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

export interface LocatedEvent {
  line: number;
  event: CommentEvent;
}

export interface Warning {
  code: "invalid_event" | "unknown_version" | "conflicting_duplicate" |
    "agent_not_allowed" | "duplicate_create" | "orphan_event";
  line: number;
  event?: string;
  comment?: string;
}

export interface Comment {
  comment: string;
  status: "open" | "resolved";
  body: string;
  target: Target;
  canvasHash: string;
  createdBy: Author;
  createdAt: string;
  updatedAt: string;
  resolvedBy?: Author;
  resolvedAt?: string;
  lastResolution?: {
    by: Author;
    at: string;
    reopenedBy: Author;
    reopenedAt: string;
  };
}

export interface ParseResult {
  events: LocatedEvent[];
  warnings: Warning[];
}

export interface FoldResult {
  comments: Comment[];
  warnings: Warning[];
}

export interface RuntimeFile {
  v: 1;
  socket: string;
  token: string;
}

export interface Selection {
  root: string;
  canvas: { path: string; id?: string };
  frame?: { id: string; title?: string };
  element?: SelectionElement;
}

export interface SocketRequest {
  v: 1;
  token: string;
  root: string;
}

export type SocketErrorCode = "bad_token" | "bad_request" | "project_not_open";

export type SocketResponse =
  | { v: 1; ok: true; result: { selection?: Selection } }
  | { v: 1; ok: false; error: { code: SocketErrorCode; message: string } };
