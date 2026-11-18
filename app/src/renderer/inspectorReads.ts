import type { InspectRefused, InspectReply as MainInspectReply, InspectRequest } from "../main/inspector";
import type { SelectionView } from "./selection";
import { acceptInspect, inspectRequestFor, type InspectFlight, type InspectPanel, type InspectReply, type InspectTarget } from "./inspectorRows";

export type InspectCall = (request: InspectRequest) => Promise<MainInspectReply | InspectRefused>;

// The selection the canvas page applied (never one only sent to the canvas), with the canvas it is in.
export interface InspectorSelection {
  canvas: { root: string; path: string };
  view: SelectionView;
}

// The anchor main's collector looks up: an element's selector, or a frame's own path step.
export function inspectTarget(selection: InspectorSelection): InspectTarget | null {
  const selector = selection.view.element?.selector ?? selection.view.path.at(-1)?.selector;
  return selector ? { canvas: selection.canvas, selector } : null;
}

// What the panel draws. `seq` names the read in flight, so a new selection's delayed spinner starts again.
export interface InspectorReadState {
  panel: InspectPanel;
  retrying: boolean;
  seq: number;
}

const IDLE: InspectFlight = { seq: 0, target: null, same: false };

// The inspector's `inspect:get` flow for one panel: a request per accepted selection while the panel shows, a reply
// taken only while it is still the latest for that selection and canvas (inspectorRows.ts). The rows of a selection
// read again (found after a reload, the same canvas at a new path, picked again, Retry) stay until the reply; Retry
// keeps the failure line, busy, until it answers. A store, so the panel reads it with useSyncExternalStore.
export class InspectorReads {
  private flight = IDLE;
  private state: InspectorReadState = { panel: { kind: "empty" }, retrying: false, seq: 0 };
  private shown = false;
  private selection: InspectorSelection | null = null;
  private seen: { view: SelectionView | null; document: string | null } = { view: null, document: null };
  private readonly listeners = new Set<() => void>();

  constructor(private readonly inspect: InspectCall) {}

  readonly get = (): InspectorReadState => this.state;
  readonly subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };

  // The panel's inputs after each commit: whether it shows (open and not yielding to a narrow window), the accepted
  // selection and the shown document's token.
  update(shown: boolean, given: InspectorSelection | null, document: string | null): void {
    const view = given?.view ?? null;
    const previous = this.seen;
    // A selection belongs to the canvas it was applied in. A same-id move changes the open canvas's path at once while
    // the controller keeps the old selection until the moved canvas finds it again; until then it is still that
    // canvas's selection, so nothing is asked and the rows stay.
    const selection = given !== null && this.selection !== null && view === previous.view ? { ...given, canvas: this.selection.canvas } : given;
    this.shown = shown;
    this.selection = selection;
    this.seen = { view, document };
    const target = selection === null ? null : inspectTarget(selection);
    const viewChanged = previous.view !== view, documentChanged = previous.document !== document;
    const asked = this.flight.target;
    // The same anchor applied again reads in place. After a not-shown, the next selection apply or shown-document
    // change asks once more; the reply itself never does (main answers not-shown until that canvas shows again).
    const again = target !== null && asked !== null && ((viewChanged && asked.selector === target.selector && asked.canvas.root === target.canvas.root)
      || (this.flight.notShown === true && (viewChanged || documentChanged)));
    this.ask(target, again, false);
  }

  retry(): void {
    if (this.state.retrying || this.selection === null) return;
    this.ask(inspectTarget(this.selection), true, true);
  }

  private ask(target: InspectTarget | null, again: boolean, retried: boolean): void {
    const { flight, send } = inspectRequestFor({ visible: this.shown, accepted: target, flight: this.flight, again });
    this.flight = flight;
    if (send === null) {
      if (flight.target === null && (this.state.panel.kind !== "empty" || this.state.retrying)) this.set({ panel: { kind: "empty" }, retrying: false });
      return;
    }
    const sent = send.target;
    if (sent === null) return;
    if (retried) this.set({ retrying: true, seq: send.seq });
    else {
      const previous = this.state.panel;
      const kept = previous.kind === "rows" || previous.kind === "reading" ? previous.rows : null;
      this.set({ panel: { kind: "reading", rows: send.same ? kept : null }, seq: send.seq });
    }
    const request: InspectRequest = { selector: sent.selector, canvas: sent.canvas, seq: send.seq };
    this.inspect(request).then(reply => this.settle(request, reply), () => this.settle(request, { ok: false, reason: "unavailable" }));
  }

  private settle(request: InspectRequest, reply: MainInspectReply | InspectRefused): void {
    // A refusal echoes nothing; it still answers this request.
    const echoed: InspectReply = "seq" in reply ? reply : { ...request, ...reply };
    const accepted = acceptInspect(this.state.panel, this.flight, echoed);
    if (accepted === null) return;
    this.flight = accepted.flight;
    this.set({ panel: accepted.panel, retrying: false });
  }

  private set(change: Partial<InspectorReadState>): void {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }
}
