import type { RefObject } from "react";
import { Popover } from "radix-ui";
import { Crosshair, Download, Hand, MousePointer2, Play, Scan } from "lucide-react";
import type { Playability } from "../main/prototype/playability";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import type { CanvasTool } from "./canvasTool";
import { dockedBuddy } from "./dockedBuddyShell";
import { FrameListBody } from "./FrameListBody";
import type { DrawerGroup, DrawerRow } from "./frameDrawerList";
import { moveBetweenTools } from "./toolbarKeys";

const TOOLS: readonly { tool: CanvasTool; label: string; key: string; Icon: typeof Hand }[] = [
  { tool: "select", label: "Select", key: "V", Icon: MousePointer2 },
  { tool: "hand", label: "Hand", key: "H", Icon: Hand },
];

// The bottom tools row (PRODUCT §5 item 2 'Toolbar'). Select and Hand are
// pressed one at a time; pressing the pressed one keeps it. The pressed tool holds the toolbar's one Tab stop. In
// Hand a canvas click does not select, so the pressed button is what tells the person why.
// The Picker is not a tool that stays: it toggles the composer's one pick, and only it
// shows pressed while picking. aria-disabled, not disabled, so its reason shows as a tooltip and ←/→ still reach it.
// Export (spec 5) closes the row after a divider: an action on the open canvas, so it has no pressed state. `reason`
// null: it can export; otherwise it stays aria-disabled, so it keeps focus through the save panel and the export.
// `onExport` gets the button, where focus goes back when the save panel closes.
// The unavailable Export's reason is also an sr-only sibling it names: Radix links the tooltip only while it is open, so
// without it the reason is gone once the tooltip closes. One canvas area, so one id.
// Capture area follows the Picker: a mode, pressed only during capture mode, with no
// shortcut, and Export's sr-only reason while unavailable. During capture mode it always ends the mode, even
// once it could not start again (a paste filled the draft meanwhile), so a pressed button is never a dead one.
// Play prototype sits before Export: like Export it is an action with no pressed state, reached with ←/→. Its name stays
// "Play prototype"; its tooltip says what a press does now and is also its sr-only description. It plays a frame, opens
// the frame drawer above it, or is unavailable with its reason. It is one element in every state (POSTMORTEM
// 2026-11-13), always the popover's trigger: outside the drawer state Radix's popup attributes are taken off and its
// open request is ignored. `button` lets App focus it when the size bubble's Play goes away or the prototype window
// closes.
const EXPORT_REASON_ID = "canvas-export-reason";
const PLAY_REASON_ID = "canvas-play-reason";
const CAPTURE_REASON_ID = "canvas-capture-reason";
// `button` lets App focus the Picker when the size bubble's Add to message goes away.
export interface PickerTool { enabled: boolean; reason: string | null; onToggle(): void; button?: RefObject<HTMLButtonElement | null> }
export interface CaptureTool { enabled: boolean; reason: string | null; onToggle(): void }
export interface ExportTool { reason: string | null; onExport(button: HTMLElement): void }
export interface PlayTool {
  kind: Playability["kind"];
  tooltip: string;
  onPlay(): void;
  // The drawer's open state, which App keeps; `drawer` is its body, present in the drawer state only.
  open: boolean;
  onOpenChange(open: boolean): void;
  drawer: { label: string; groups: DrawerGroup[]; onPick(row: DrawerRow): void } | null;
  button?: RefObject<HTMLButtonElement | null>;
}
// An open tooltip takes the Escape first (Radix prevents it), so each tooltip's Escape also runs `onEscape`, the
// canvas's next Escape step; the tooltip still closes on that press (ARCHITECTURE §3 'Actions and focus').
export function CanvasTools({ tool, picking, capturing, onTool, picker, capture, player, exporter, onEscape }: { tool: CanvasTool; picking: boolean; capturing: boolean; onTool(tool: CanvasTool): void; picker: PickerTool; capture: CaptureTool; player: PlayTool; exporter: ExportTool; onEscape(event: globalThis.KeyboardEvent): void }) {
  const pressed = (own: CanvasTool) => !picking && !capturing && tool === own;
  const captureOff = !capturing && !capture.enabled;
  const drawer = player.kind === "drawer" ? player.drawer : null;
  return <div className="doan-floating doan-canvas-tools" role="toolbar" aria-label="Canvas tools" onKeyDown={moveBetweenTools}>
    {/* The docked buddy's second floor, on the toolbar's top edge. */}
    <div className="docked-buddy-slot" ref={dockedBuddy.toolsSlot} aria-hidden="true" />
    {TOOLS.map(({ tool: own, label, key, Icon }) => <Tooltip key={own}><TooltipTrigger asChild>
      <button type="button" className="doan-icon-button doan-canvas-tool" data-ui-size="md" aria-pressed={pressed(own)} aria-label={label} aria-keyshortcuts={key}
        tabIndex={pressed(own) ? 0 : -1} onClick={() => onTool(own)}><Icon aria-hidden="true" /></button>
    </TooltipTrigger><TooltipContent className="has-key" onEscapeKeyDown={onEscape}>{label}<span className="doan-kbd" data-ui-variant="on-prominent" data-ui-size="sm">{key}</span></TooltipContent></Tooltip>)}
    <Tooltip><TooltipTrigger asChild>
      <button ref={picker.button} type="button" className="doan-icon-button doan-canvas-tool" data-ui-size="md" aria-pressed={picking} aria-label="Pick from canvas" aria-keyshortcuts="Meta+L"
        aria-disabled={!picker.enabled || undefined} tabIndex={picking ? 0 : -1} onClick={() => { if (picker.enabled) picker.onToggle(); }}><Crosshair aria-hidden="true" /></button>
    </TooltipTrigger>{picker.enabled
      ? <TooltipContent className="has-key" onEscapeKeyDown={onEscape}>Pick from canvas<span className="doan-kbd" data-ui-variant="on-prominent" data-ui-size="sm">⌘L</span></TooltipContent>
      : <TooltipContent onEscapeKeyDown={onEscape}>{picker.reason ?? "Pick from canvas"}</TooltipContent>}</Tooltip>
    <Tooltip><TooltipTrigger asChild>
      <button type="button" className="doan-icon-button doan-canvas-tool" data-ui-size="md" aria-pressed={capturing} aria-label="Capture area" tabIndex={capturing ? 0 : -1}
        {...(captureOff ? { "aria-disabled": true, "aria-describedby": CAPTURE_REASON_ID } : {})}
        onClick={() => { if (!captureOff) capture.onToggle(); }}><Scan aria-hidden="true" /></button>
    </TooltipTrigger><TooltipContent onEscapeKeyDown={onEscape}>{captureOff ? capture.reason ?? "Capture area" : "Capture area"}</TooltipContent></Tooltip>
    {captureOff && <span className="sr-only" id={CAPTURE_REASON_ID}>{capture.reason ?? "Capture area"}</span>}
    <span className="doan-canvas-tools-sep" role="separator" aria-orientation="vertical" />
    <Popover.Root open={drawer !== null && player.open} onOpenChange={next => { if (!next || drawer !== null) player.onOpenChange(next); }}>
      <Tooltip><Popover.Trigger asChild><TooltipTrigger asChild>
        <button ref={player.button} type="button" className="doan-icon-button doan-canvas-tool" data-ui-size="md" aria-label="Play prototype" tabIndex={-1} aria-describedby={PLAY_REASON_ID}
          {...(player.kind === "disabled" ? { "aria-disabled": true } : { "data-own-description": "" })}
          {...(drawer !== null ? { "aria-haspopup": "listbox" } : { "aria-haspopup": undefined, "aria-expanded": undefined, "aria-controls": undefined })}
          onClick={() => { if (player.kind === "play") player.onPlay(); }}><Play aria-hidden="true" /></button>
      </TooltipTrigger></Popover.Trigger><TooltipContent onEscapeKeyDown={onEscape}>{player.tooltip}</TooltipContent></Tooltip>
      {drawer !== null && <FrameListBody label={drawer.label} groups={drawer.groups} open={player.open} onPick={drawer.onPick} className="doan-floating doan-menu doan-frame-list" side="top" align="center" />}
    </Popover.Root>
    <span className="sr-only" id={PLAY_REASON_ID}>{player.tooltip}</span>
    <Tooltip><TooltipTrigger asChild>
      <button type="button" className="doan-icon-button doan-canvas-tool" data-ui-size="md" aria-label="Export canvas" tabIndex={-1}
        {...(exporter.reason !== null ? { "aria-disabled": true, "aria-describedby": EXPORT_REASON_ID } : {})}
        onClick={event => { if (exporter.reason === null) exporter.onExport(event.currentTarget); }}><Download aria-hidden="true" /></button>
    </TooltipTrigger><TooltipContent onEscapeKeyDown={onEscape}>{exporter.reason ?? "Export canvas"}</TooltipContent></Tooltip>
    {exporter.reason !== null && <span className="sr-only" id={EXPORT_REASON_ID}>{exporter.reason}</span>}
  </div>;
}
