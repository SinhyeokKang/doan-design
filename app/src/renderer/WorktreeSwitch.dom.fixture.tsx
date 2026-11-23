import type { Root } from "react-dom/client";
import type { CanvasRow, FolderEntry } from "../main/view";
import { CanvasController, CanvasViewStore, canvasViewFields, initialCanvasState } from "./CanvasController";
import { CanvasHeader } from "./CanvasHeader";
import { TooltipProvider } from "./components/ui/tooltip";
import { DockedSupport } from "./dockedSupport";
import { OverviewRun } from "./overviewRun";
import { ProjectOverview } from "./ProjectOverview";
import { ShellSidebar } from "./ShellSidebar";

const noop = () => {};
const main = "/code/demo";
const next = "/code/next";
const common = main + "/.git";
const canvas: CanvasRow = { path: ".doan/canvases/a.html", id: "a", url: "http://localhost/test/.doan/canvases/a.html", width: 600 };
const listed = (path: string, branch: string): FolderEntry => ({
  kind: "list", path, servedRev: 0, canvases: [canvas], git: { branch, common, worktrees: [main, next] },
});

export function mountCanvas(root: Root) {
  const rows = [listed(main, "main"), listed(next, "next")];
  const viewport = document.createElement("section");
  viewport.tabIndex = -1;
  const board = document.createElement("div"), overlay = document.createElement("div"), layer = document.createElement("div");
  viewport.append(board, overlay, layer);
  document.body.append(viewport);
  const view = new CanvasViewStore(canvasViewFields(initialCanvasState()));
  const controller = new CanvasController(viewport, board, overlay, state => {
    const folder = state.open?.folder;
    if (!folder) return;
    document.body.dataset.picking = String(state.picking);
    document.body.dataset.tool = state.tool;
    view.set(canvasViewFields(state), false);
    root.render(<TooltipProvider><CanvasHeader state={state} view={view} canvasKey={JSON.stringify([folder, canvas.path])}
      navigation={{ card: { key: common, name: "demo", rows }, root: folder, homeDirectory: "/code",
        worktree: to => controller.openCanvas(to, canvas, undefined, { keepView: true }) }}
      fallbackFocus={() => viewport.focus()} command={noop} zoomTo={noop} selectFrame={noop} /></TooltipProvider>);
  }, noop, layer, async () => null);
  controller.updateEntries(rows);
  controller.setCanvasPage(true);
  controller.openCanvas(main, canvas);
  return () => {
    window.dispatchEvent(new MessageEvent("message", { origin: "null", source: board.querySelector("iframe")!.contentWindow,
      data: { type: "layout", href: canvas.url, height: 150, viewport: 150, frames: [], truncated: false } }));
    return controller.pick();
  };
}

export function mountRecovery(root: Root, host: "overview" | "sidebar", kind: "cliError" | "error") {
  const entry = listed(main, "main");
  const problem: FolderEntry = kind === "cliError" ? { path: next, kind, reason: "CLI failed", lastCommon: common }
    : { path: next, kind, message: "Invalid config", config: next + "/.doan/config.json", lastCommon: common };
  const rows = [entry, problem];
  const action = (name: string, path: string) => { document.body.dataset.action = name + path; };
  if (host === "sidebar") {
    root.render(<TooltipProvider><ShellSidebar cards={[{ key: common, name: "demo", rows }]}
      projects={{ [common]: { roots: [main, next], expanded: false } }} loaded={main} canvas={undefined} homeDirectory="/code"
      search={noop} toggle={noop} disclose={noop} toggleGroup={noop} worktree={noop} open={noop} overview={noop}
      action={action} remove={async () => {}} projectSettings={noop}
      canvasMenu={{ blocked: () => false, exporting: () => false, exportCanvas: noop, trash: noop }} /></TooltipProvider>);
    return;
  }
  Object.assign(window, { doan: { onAgentAuth: () => noop, onAgentUsage: () => noop, takeConversationDraft: async () => null } });
  const run = new OverviewRun({ list: () => [], readsStarted: () => 1, readsApplied: () => 1, reread: noop, remembered: () => ({}),
    remember: noop, markSeen: noop, focused: () => true, openCanvas: noop, toast: noop, label: () => "demo", changed: noop }, window.doan);
  run.show(main);
  const support = new DockedSupport(noop, window.doan);
  support.presets = { v: 1, ok: true, result: { version: "1", presets: [] } };
  root.render(<TooltipProvider><ProjectOverview run={run} support={support} root={main} project="demo" entry={entry}
    worktrees={rows} homeDirectory="/code" notice={null} unavailable={null} list={[]} seen={new Set()} prefs={{}}
    defaults={null} now={0} onWorktree={noop} onOpenCanvas={noop} onRetryList={noop} onStart={async () => ({ ok: true })}
    onSettings={noop} onSendConversation={async () => {}} onAction={action} onProjectSettings={noop} /></TooltipProvider>);
}
