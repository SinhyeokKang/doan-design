import type { KeyboardEvent } from "react";
import { Crosshair, Download, Hand, MousePointer2, Scan } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import type { CanvasTool } from "./canvasTool";

// ←/→ walk the tools; Tab stops on the toolbar once, so tools added later keep the page's Tab order.
function moveBetweenTools(event: KeyboardEvent<HTMLDivElement>): void {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const tools = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
  const next = tools[tools.indexOf(document.activeElement as HTMLButtonElement) + (event.key === "ArrowRight" ? 1 : -1)];
  if (next) { event.preventDefault(); next.focus(); }
}

const TOOLS: readonly { tool: CanvasTool; label: string; key: string; Icon: typeof Hand }[] = [
  { tool: "select", label: "Select", key: "V", Icon: MousePointer2 },
  { tool: "hand", label: "Hand", key: "H", Icon: Hand },
];

// The bottom tools row (buzz-canvas design §2 '도구모음', canvas-hand-tool design '도구모음'). Select and Hand are
// pressed one at a time; pressing the pressed one keeps it. The pressed tool holds the toolbar's one Tab stop. In
// Hand a canvas click does not select, so the pressed button is what tells the person why.
// The Picker (canvas-composer-polish spec 3) is not a tool that stays: it toggles the composer's one pick, and only it
// shows pressed while picking. aria-disabled, not disabled, so its reason shows as a tooltip and ←/→ still reach it.
// Export (spec 5) closes the row after a divider: an action on the open canvas, so it has no pressed state. `reason`
// null: it can export; otherwise it stays aria-disabled, so it keeps focus through the save panel and the export.
// `onExport` gets the button, where focus goes back when the save panel closes.
// The unavailable Export's reason is also an sr-only sibling it names: Radix links the tooltip only while it is open, so
// without it the reason is gone once the tooltip closes. One canvas area, so one id.
// Capture area (canvas-capture design §3) follows the Picker: a mode, pressed only during capture mode, with no
// shortcut (결정 5), and Export's sr-only reason while unavailable. During capture mode it always ends the mode, even
// once it could not start again (a paste filled the draft meanwhile), so a pressed button is never a dead one.
const EXPORT_REASON_ID = "canvas-export-reason";
const CAPTURE_REASON_ID = "canvas-capture-reason";
export interface PickerTool { enabled: boolean; reason: string | null; onToggle(): void }
export interface CaptureTool { enabled: boolean; reason: string | null; onToggle(): void }
export interface ExportTool { reason: string | null; onExport(button: HTMLElement): void }
export function CanvasTools({ tool, picking, capturing, onTool, picker, capture, exporter }: { tool: CanvasTool; picking: boolean; capturing: boolean; onTool(tool: CanvasTool): void; picker: PickerTool; capture: CaptureTool; exporter: ExportTool }) {
  const pressed = (own: CanvasTool) => !picking && !capturing && tool === own;
  const captureOff = !capturing && !capture.enabled;
  return <div className="doan-floating doan-canvas-tools" role="toolbar" aria-label="Canvas tools" onKeyDown={moveBetweenTools}>
    {TOOLS.map(({ tool: own, label, key, Icon }) => <Tooltip key={own}><TooltipTrigger asChild>
      <button type="button" className="doan-icon-button doan-canvas-tool" data-ui-size="md" aria-pressed={pressed(own)} aria-label={label} aria-keyshortcuts={key}
        tabIndex={pressed(own) ? 0 : -1} onClick={() => onTool(own)}><Icon aria-hidden="true" /></button>
    </TooltipTrigger><TooltipContent className="has-key">{label}<span className="doan-kbd" data-ui-variant="on-prominent" data-ui-size="sm">{key}</span></TooltipContent></Tooltip>)}
    <Tooltip><TooltipTrigger asChild>
      <button type="button" className="doan-icon-button doan-canvas-tool" data-ui-size="md" aria-pressed={picking} aria-label="Pick from canvas" aria-keyshortcuts="Meta+L"
        aria-disabled={!picker.enabled || undefined} tabIndex={picking ? 0 : -1} onClick={() => { if (picker.enabled) picker.onToggle(); }}><Crosshair aria-hidden="true" /></button>
    </TooltipTrigger>{picker.enabled
      ? <TooltipContent className="has-key">Pick from canvas<span className="doan-kbd" data-ui-variant="on-prominent" data-ui-size="sm">⌘L</span></TooltipContent>
      : <TooltipContent>{picker.reason ?? "Pick from canvas"}</TooltipContent>}</Tooltip>
    <Tooltip><TooltipTrigger asChild>
      <button type="button" className="doan-icon-button doan-canvas-tool" data-ui-size="md" aria-pressed={capturing} aria-label="Capture area" tabIndex={capturing ? 0 : -1}
        {...(captureOff ? { "aria-disabled": true, "aria-describedby": CAPTURE_REASON_ID } : {})}
        onClick={() => { if (!captureOff) capture.onToggle(); }}><Scan aria-hidden="true" /></button>
    </TooltipTrigger><TooltipContent>{captureOff ? capture.reason ?? "Capture area" : "Capture area"}</TooltipContent></Tooltip>
    {captureOff && <span className="sr-only" id={CAPTURE_REASON_ID}>{capture.reason ?? "Capture area"}</span>}
    <span className="doan-canvas-tools-sep" role="separator" aria-orientation="vertical" />
    <Tooltip><TooltipTrigger asChild>
      <button type="button" className="doan-icon-button doan-canvas-tool" data-ui-size="md" aria-label="Export canvas" tabIndex={-1}
        {...(exporter.reason !== null ? { "aria-disabled": true, "aria-describedby": EXPORT_REASON_ID } : {})}
        onClick={event => { if (exporter.reason === null) exporter.onExport(event.currentTarget); }}><Download aria-hidden="true" /></button>
    </TooltipTrigger><TooltipContent>{exporter.reason ?? "Export canvas"}</TooltipContent></Tooltip>
    {exporter.reason !== null && <span className="sr-only" id={EXPORT_REASON_ID}>{exporter.reason}</span>}
  </div>;
}
