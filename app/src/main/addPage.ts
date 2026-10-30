import { randomUUID } from "node:crypto";
import type { OnboardingOperation, OnboardingResponse, OnboardingState } from "../formats/types";
import type { AddPageRequest } from "./addPageRequest";
import { OperationBook, refuse, type WriteRequest } from "./onboarding/operations";
import { ProjectAdder, type AdderProjects, type ProjectLocks } from "./onboarding/projectAdder";

// The Add Projects page's project session: a second project adder beside first run's, answering with the onboarding
// session's DTOs so the renderer's Project step reads both alike (buzz-add-projects design 'main의 project 처리').
// Electron-free; index.ts carries the IPC, the window events and quit.

export const ADD_PAGE_CHANNELS = {
  read: "add-projects:read", inspect: "add-projects:inspect", select: "add-projects:select", clone: "add-projects:clone", cancel: "add-projects:cancel",
  changed: "add-projects:changed",
  // File > Add Project…: main asks the renderer to open the page, or its Choose folder when the page shows its choose phase.
  open: "add-projects:open",
} as const;

// First run's state without agents and completion, which the page has neither of.
export type AddPageState = Pick<OnboardingState, "sessionId" | "revision" | "project" | "operations">;
export type AddPageResponse = { v: 2; ok: true; op: "status"; result: AddPageState } | Exclude<OnboardingResponse, { op: "start" | "status" }>;

export interface AddPageOptions {
  projects: AdderProjects;
  // The same object first run's session gets.
  locks: ProjectLocks;
  publish(state: AddPageState): void;
  newId?: () => string;
  quickReplyMs?: number;
}

export class AddPageSession {
  readonly sessionId: string;
  private revision = 0;
  private readonly book: OperationBook;
  private readonly adder: ProjectAdder;
  constructor(private readonly options: AddPageOptions) {
    const newId = options.newId ?? randomUUID;
    this.sessionId = newId();
    this.book = new OperationBook(newId);
    this.adder = new ProjectAdder({
      track: (kind, requestId) => { const tracked = this.book.add({ kind, requestId, state: "running" }, null); this.touch(); return tracked; },
      finish: (tracked, finished) => { this.book.settle(tracked, finished); this.touch(); },
      changed: () => this.touch(),
      values: () => this.book.values(),
      reply: (op, operationId) => this.book.reply(op, operationId),
    }, options.projects, options.locks, { newId, ...(options.quickReplyMs === undefined ? {} : { quickReplyMs: options.quickReplyMs }), label: "add projects" });
  }

  async answer(request: AddPageRequest): Promise<AddPageResponse> {
    if (request.op === "read") return { v: 2, ok: true, op: "status", result: this.state() };
    if (request.sessionId !== this.sessionId) return refuse("session_stale") as AddPageResponse;
    if (request.op === "status") {
      if (request.operationId === undefined) return { v: 2, ok: true, op: "status", result: this.state() };
      const operation = this.book.find(request.operationId);
      if (!operation) return refuse("operation_not_found") as AddPageResponse;
      return { v: 2, ok: true, op: "status", result: this.state([operation]) };
    }
    return await this.book.once(request, () => this.write(request)) as AddPageResponse;
  }
  state(operations: OnboardingOperation[] = this.book.list()): AddPageState {
    return { sessionId: this.sessionId, revision: this.revision, project: this.adder.project, operations };
  }

  // A reloaded or crashed renderer can no longer show or cancel its clone, so the clone stops and cleans up as Cancel
  // would. Hiding the window is not this: the page and its clone stay.
  rendererGone(): void { this.adder.cancelClones(); }
  closeForQuit(): void { this.adder.closeForQuit(); }
  reopenAfterAbortedQuit(): void { this.adder.reopenAfterAbortedQuit(); }
  quit(): Promise<void> { return this.adder.quit(); }

  private async write(request: Extract<WriteRequest, { op: "cancel" | "project_inspect" | "project_select" | "project_clone" }>): Promise<OnboardingResponse> {
    switch (request.op) {
      case "cancel": {
        const tracked = this.book.get(request.operationId);
        if (!tracked) return refuse("operation_not_found");
        this.adder.cancel(tracked);
        return this.book.reply("cancel", request.operationId);
      }
      case "project_inspect": return this.adder.inspect(request);
      case "project_select": return this.adder.select(request);
      case "project_clone": return this.adder.clone(request);
    }
  }

  private touch(): void {
    this.book.prune();
    this.revision += 1;
    this.options.publish(this.state());
  }
}
