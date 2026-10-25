import { Fragment } from "react";
import { activityFor, movedFrom, timeText } from "./activity";
import { canvasInfo } from "./canvasInfo";
import type { InspectRow } from "../main/inspect";
import type { CanvasState, InspectorView } from "./CanvasController";
import type { PathItem, SelectTarget } from "./canvasMessage";
import { frameLabel } from "./canvasView";
import { INSPECT_GROUPS, sourceNotes, swatchColor, tokenTitle } from "./inspector";
import type { SelectionView } from "./selection";

export function RightPanel({ state, selectPath }: { state: CanvasState; selectPath: (item: PathItem) => void }) {
  const open = state.open;
  if (open && state.selection) return <Inspector selection={state.selection} inspector={state.inspector} selectPath={selectPath} />;
  const info = open ? canvasInfo(open.row, state.unlisted ? null : state.layout) : null;
  return <aside className="right native-scroll" role="region" aria-label="Canvas info">
    <h2 className="phead">Canvas</h2>
    {!open || !info ? <p className="pempty">No canvas open</p> : <>
      <div className="isec"><dl className="kv"><dt>Path</dt><dd>{info.path}</dd><dt>ID</dt><dd>{info.id}</dd><dt>Width</dt><dd>{info.width}</dd><dt>Frames</dt><dd>{info.frames}</dd></dl></div>
      <p className="pempty">Click an element or frame to inspect or comment on it.</p>
      <section className="isec activity" aria-label="Activity"><h3 className="ihead">Activity</h3><ol>{activityFor(state.activity, open.folder, open.canvas, open.row.id).map((event, index) => <li className="tl-row" key={index}><time>{timeText(event.at)}</time><b>{event.kind === "opened" ? "Opened" : event.kind === "moved" ? "Moved" : "Reloaded"}</b>{event.kind === "moved" && <span className="from" title={movedFrom(event)}>· from {movedFrom(event)}</span>}</li>)}</ol></section>
    </>}
  </aside>;
}

// Canvas strings are React text only (design 'decision impact'); a cut value
// keeps its full text in the native tooltip.
function Truncate({ value, title = value, className }: { value: string; title?: string; className?: string }) {
  return <span className={className === undefined ? "truncate" : `truncate ${className}`} title={title}>{value}</span>;
}

function frameText(frame: NonNullable<SelectTarget["frame"]>): string {
  const label = frameLabel(frame);
  return label.title === undefined ? label.id : `${label.id} · ${label.title}`;
}

export function Inspector({ selection, inspector, selectPath }: { selection: SelectionView; inspector: InspectorView | null; selectPath: (item: PathItem) => void }) {
  const { element, frame } = selection;
  const rows = inspector?.status === "ready" ? inspector.rows : [];
  const last = selection.path.length - 1;
  return <aside className="right native-scroll" role="region" aria-label="Inspector">
    <h2 className="phead">Inspector</h2>
    <div className="inspect-head">
      <h3>{!element && frame ? frameLabel(frame).id : selection.tag}</h3>
      {element && <Truncate className="selector" value={element.selector} />}
      {element ? frame && <dl className="head-kv"><dt>Frame</dt><dd>{frameText(frame)}</dd></dl>
        : frame && (frame.title !== undefined || frame.implements !== undefined) && <dl className="head-kv">
          {frame.title !== undefined && <><dt>Title</dt><dd>{frame.title}</dd></>}
          {frame.implements !== undefined && <><dt>Implements</dt><dd className="truncate" title={frame.implements}>{frame.implements}</dd></>}
        </dl>}
      {selection.path.length > 0 && <nav className="ancestors" aria-label="Ancestor path">
        {selection.path.map((item, index) => <Fragment key={index}>
          {index > 0 && <span aria-hidden="true">›</span>}
          <button className="truncate" title={item.label} aria-current={index === last ? "true" : "false"} onClick={() => selectPath(item)}>{item.label}</button>
        </Fragment>)}
      </nav>}
      {selection.interactive && <p className="use-hint">{selection.interactive === "link" ? "⌥-click to follow this link" : "⌥-click to use it"}</p>}
    </div>
    {inspector?.status === "loading" && <p className="canvas-notice" role="status">Reading styles…</p>}
    {inspector?.status === "failed" && <p className="inspect-failed">{inspector.reason}</p>}
    {INSPECT_GROUPS.map(([group, heading]) => {
      const groupRows = rows.filter(row => row.group === group);
      if (groupRows.length === 0) return null;
      return <section className="isec" key={group}><h3 className="ihead">{heading}</h3>{groupRows.map((row, index) => <Row row={row} key={index} />)}</section>;
    })}
    {element && <section className="isec doan-attributes">
      <h3 className="ihead">Doan attributes</h3>
      <Attribute label="id" name="data-doan-id" value={element.doanId ?? "—"} />
      <Attribute label="implements" name="data-doan-implements" value={frame?.implements ?? "—"} note={frame?.implements === undefined ? undefined : `from frame ${frameLabel(frame).id}`} />
    </section>}
  </aside>;
}

function Row({ row }: { row: InspectRow }) {
  const dim = row.state === "default";
  // The draft draws Width and Height without a source line.
  const sized = row.group === "box" && (row.label === "Width" || row.label === "Height");
  const notes = sourceNotes(row);
  const swatch = swatchColor(row);
  return <div className="inspect-row">
    <div className="value-line">
      <span className="prop" title={row.label}>{row.label}</span>
      <span className={dim ? "value default" : "value"}>
        {swatch !== undefined && <i className="swatch" aria-hidden="true" style={{ backgroundColor: swatch }} />}
        <Truncate value={row.value} title={dim ? "Default" : row.value} />
      </span>
    </div>
    {!dim && !sized && (row.token !== undefined || notes.length > 0) && <div className="source-line">
      {row.token !== undefined && <Truncate className="token" value={row.token} title={tokenTitle(row)} />}
      {notes.map((note, index) => <span className={note.hardcoded ? "state hardcoded" : "state"} title={note.title} key={index}>{note.text}</span>)}
    </div>}
  </div>;
}

function Attribute({ label, name, value, note }: { label: string; name: string; value: string; note?: string | undefined }) {
  return <div className="inspect-row">
    <div className="value-line">
      <span className="prop" title={name}>{label}</span>
      <span className="value"><Truncate value={value} /></span>
    </div>
    {note !== undefined && <div className="source-line"><span className="state">{note}</span></div>}
  </div>;
}
