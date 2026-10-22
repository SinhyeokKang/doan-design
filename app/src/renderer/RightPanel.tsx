import { activityFor, timeText } from "./activity";
import { canvasInfo } from "./canvasInfo";
import type { CanvasState } from "./CanvasController";

export function RightPanel({ state }: { state: CanvasState }) {
  const open = state.open;
  const info = open ? canvasInfo(open.row, state.unlisted ? null : state.layout) : null;
  return <aside className="right native-scroll" role="region" aria-label="Canvas info">
    <h2 className="phead">Canvas</h2>
    {!open || !info ? <p className="pempty">No canvas open</p> : <>
      <div className="isec"><dl className="kv"><dt>Path</dt><dd>{info.path}</dd><dt>ID</dt><dd>{info.id}</dd><dt>Width</dt><dd>{info.width}</dd><dt>Frames</dt><dd>{info.frames}</dd></dl></div>
      <div className="isec"><h3 className="ihead">Comments</h3><dl className="kv"><dt>Open</dt><dd className="accent">{info.open}</dd><dt>Resolved</dt><dd>{info.resolved}</dd></dl></div>
      <section className="isec activity" aria-label="Activity"><h3 className="ihead">Activity</h3><ol>{activityFor(state.activity, open.folder, open.canvas).map((event, index) => <li className="tl-row" key={index}><time>{timeText(event.at)}</time><b>{event.kind === "opened" ? "Opened" : "Reloaded"}</b></li>)}</ol></section>
    </>}
  </aside>;
}
