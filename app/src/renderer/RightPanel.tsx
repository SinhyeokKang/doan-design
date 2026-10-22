import { Fragment } from "react";
import { activityFor, timeText } from "./activity";
import { canvasInfo } from "./canvasInfo";
import type { CanvasState } from "./CanvasController";
import type { PathItem } from "./canvasMessage";
import { frameLabel } from "./canvasView";
import { inspectorStateText, INSPECTOR_PLACEHOLDER, type InspectRow } from "./inspector";
import type { SelectionView } from "./selection";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";

export function RightPanel({ state, selectPath }: { state: CanvasState; selectPath: (item: PathItem) => void }) {
  const open = state.open;
  if (open && state.selection) return <Inspector selection={state.selection} rows={INSPECTOR_PLACEHOLDER} selectPath={selectPath} />;
  const info = open ? canvasInfo(open.row, state.unlisted ? null : state.layout) : null;
  return <aside className="right native-scroll" role="region" aria-label="Canvas info">
    <h2 className="phead">Canvas</h2>
    {!open || !info ? <p className="pempty">No canvas open</p> : <>
      <p className="pempty">Click an element or frame to inspect it. Frames are also listed in the sidebar.</p>
      <div className="isec"><dl className="kv"><dt>Path</dt><dd>{info.path}</dd><dt>ID</dt><dd>{info.id}</dd><dt>Width</dt><dd>{info.width}</dd><dt>Frames</dt><dd>{info.frames}</dd></dl></div>
      <div className="isec"><h3 className="ihead">Comments</h3><dl className="kv"><dt>Open</dt><dd className="accent">{info.open}</dd><dt>Resolved</dt><dd>{info.resolved}</dd></dl></div>
      <section className="isec activity" aria-label="Activity"><h3 className="ihead">Activity</h3><ol>{activityFor(state.activity, open.folder, open.canvas).map((event, index) => <li className="tl-row" key={index}><time>{timeText(event.at)}</time><b>{event.kind === "opened" ? "Opened" : "Reloaded"}</b></li>)}</ol></section>
    </>}
  </aside>;
}

// Canvas strings are written as React text only (design 'decision impact').
function LongValue({ value }: { value: string }) {
  return <Tooltip><TooltipTrigger asChild><span className="long-value">{value}</span></TooltipTrigger><TooltipContent>{value}</TooltipContent></Tooltip>;
}

function Inspector({ selection, rows, selectPath }: { selection: SelectionView; rows: readonly InspectRow[]; selectPath: (item: PathItem) => void }) {
  const { element, frame } = selection;
  const last = selection.path.length - 1;
  return <aside className="right native-scroll" role="region" aria-label="Inspector">
    <h2 className="phead">{element ? "Element" : "Frame"}</h2>
    <div className="isec">
      <dl className="kv">
        {element ? <>
          <dt>Tag</dt><dd>{selection.tag}</dd>
          <dt>Selector</dt><dd><LongValue value={element.selector} /></dd>
          {frame && <><dt>Frame</dt><dd><LongValue value={frameLabel(frame).id} /></dd></>}
        </> : frame && <>
          <dt>ID</dt><dd><LongValue value={frameLabel(frame).id} /></dd>
          {frame.title !== undefined && <><dt>Title</dt><dd><LongValue value={frame.title} /></dd></>}
          {frame.implements !== undefined && <><dt>Implements</dt><dd><LongValue value={frame.implements} /></dd></>}
        </>}
      </dl>
      {element && selection.path.length > 0 && <nav className="ancestors" aria-label="Ancestor path">
        {selection.path.map((item, index) => <Fragment key={index}>
          {index > 0 && <span className="sep" aria-hidden="true">›</span>}
          <button aria-current={index === last ? "true" : undefined} onClick={() => selectPath(item)}>{item.label}</button>
        </Fragment>)}
      </nav>}
      {selection.interactive && <p className="alt-hint">{selection.interactive === "link" ? "⌥-click to follow this link" : "⌥-click to use it"}</p>}
    </div>
    {rows.length > 0 && <section className="isec" aria-label="Styles">
      <h3 className="ihead">Styles</h3>
      <dl className="kv">{rows.map((row, index) => <Fragment key={index}>
        <dt>{row.property}</dt>
        <dd><LongValue value={row.value} /> <span className="state">{inspectorStateText(row)}</span></dd>
      </Fragment>)}</dl>
    </section>}
  </aside>;
}
