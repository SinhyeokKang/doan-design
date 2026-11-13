import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DropdownMenu } from "radix-ui";
import { expect, test, vi } from "vitest";
import type { CanvasConversationRow } from "../../canvasConversationRows";

// Unavailable controls name their reason with their own aria-describedby (an sr-only sibling, so
// it is read while the tooltip is closed too). While the tooltip was open, Radix added its content id to that
// attribute, and the same reason was read twice. Every tooltip here is drawn open (no DOM: static markup), and each
// unavailable control must keep its own id alone; an available one still gets the open tooltip's id from Radix.
vi.mock("./tooltip", async original => {
  const actual = await original<typeof import("./tooltip")>();
  return { ...actual, Tooltip: (props: ComponentProps<typeof actual.Tooltip>) => <actual.Tooltip {...props} open /> };
});
const { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } = await import("./tooltip");
const { CanvasTools } = await import("../../CanvasTools");
const { RowDelete } = await import("../../CanvasConversationList");
const { ConversationDeleteItem } = await import("../../ConversationDeleteDialog");
const { RowButton } = await import("../../SettingsMcpConnectors");
const { SendButton } = await import("../../ComposerParts");
const { WindowShell } = await import("../../prototype/PrototypeWindow");

const describedBy = (html: string, marker: string) => {
  const tag = html.match(new RegExp(`<(?:button|div)[^>]*${marker}[^>]*>`))?.[0];
  expect(tag, marker).toBeDefined();
  return tag!.match(/aria-describedby="([^"]*)"/)?.[1] ?? null;
};
const open = (node: React.ReactNode) => renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>);
const noop = () => {};

test("an unavailable control's open tooltip leaves its own aria-describedby alone, in every place", () => {
  const tools = open(<CanvasTools tool="select" picking={false} capturing={false} onTool={noop} onEscape={noop}
    picker={{ enabled: true, reason: null, onToggle: noop }} capture={{ enabled: false, reason: "Open a canvas to capture an area.", onToggle: noop }}
    player={{ reason: "Select a supported frame to play its prototype.", onPlay: noop }} exporter={{ reason: "No canvas is open.", onExport: noop }} />);
  expect(describedBy(tools, 'aria-label="Capture area"')).toBe("canvas-capture-reason");
  expect(describedBy(tools, 'aria-label="Play prototype"')).toBe("canvas-play-reason");
  expect(describedBy(tools, 'aria-label="Export canvas"')).toBe("canvas-export-reason");

  const row = { key: "c1", title: "Tidy the header", deletable: { available: false, reason: "An agent is working on this conversation." } } as CanvasConversationRow;
  expect(describedBy(open(<RowDelete item={row} keys={["c1"]} tabbable onDelete={noop} onFocus={noop} />), 'class="doan-icon-button cv-delete"')).toBe("cv-delete-reason-c1");

  const menu = open(<DropdownMenu.Root open modal={false}><DropdownMenu.Content>
    <ConversationDeleteItem conversationId="c1" title="Tidy the header" deletable={{ available: false, reason: "An agent is working on this conversation." }} onDelete={noop} onEscape={noop} />
  </DropdownMenu.Content></DropdownMenu.Root>);
  expect(describedBy(menu, 'class="doan-icon-button conv-delete"')).toBe("conv-delete-reason-c1");

  const button = open(<RowButton button={{ command: "connect", label: "Connect", variant: "subtle", disabled: true, ariaLabel: "Connect Figma for Codex", tooltip: "Finish or cancel the Notion connection first." }}
    run={noop} describedBy="mcp-figma-reason" />);
  expect(describedBy(button, 'aria-label="Connect Figma for Codex"')).toBe("mcp-figma-reason");

  // The prototype window's Export while its canvas can't be read.
  const view = { gen: 2, root: "/r", path: ".doan/canvases/a.html", frame: "checkout", title: "Checkout", canvas: "a", phase: "read-failed", mode: "fit", run: null, frames: [], canGoBack: false, canGoForward: false, previousStopped: false } as const;
  const shell = open(<WindowShell view={{ ...view, frames: [] }} layers={{ frames: [], visible: null, snapshot: null }} readingShown={false} details={false} live="" width={640} menuOpen={false} exporting={false}
    onBack={noop} onForward={noop} onReload={noop} onReloadPress={noop} onReloadClick={noop} onMode={noop} onMenuOpen={noop} onChoose={noop} onClose={noop} onDetails={noop} onExport={noop} />);
  expect(describedBy(shell, 'aria-label="Export prototype"')).toBe("prototype-export-reason");
});

test("an available control still gets the open tooltip's id, as Radix gives it", () => {
  const tools = open(<CanvasTools tool="select" picking={false} capturing={false} onTool={noop} onEscape={noop}
    picker={{ enabled: true, reason: null, onToggle: noop }} capture={{ enabled: true, reason: null, onToggle: noop }} player={{ reason: null, onPlay: noop }} exporter={{ reason: null, onExport: noop }} />);
  for (const label of ["Select", "Capture area", "Play prototype", "Export canvas"]) expect(describedBy(tools, `aria-label="${label}"`), label).toMatch(/^radix-\S+$/);
});

// Only an unavailable control keeps its description alone: an enabled one that names a description of its own (a queued
// message's text, say) still gets the open tooltip's id after it, and aria-disabled="false" is not unavailable.
test("an enabled control with its own aria-describedby still gets the open tooltip's id after its own", () => {
  for (const disabled of [undefined, false, "false"] as const) {
    const html = open(<><span id="own-text">Queued text</span><Tooltip><TooltipTrigger asChild>
      <button type="button" aria-label="Send now" aria-describedby="own-text" {...(disabled === undefined ? {} : { "aria-disabled": disabled })}>Send now</button>
    </TooltipTrigger><TooltipContent>Send it now</TooltipContent></Tooltip></>);
    expect(describedBy(html, 'aria-label="Send now"'), String(disabled)).toMatch(/^own-text radix-\S+$/);
  }
  const html = open(<Tooltip><TooltipTrigger asChild><button type="button" aria-label="Unavailable" aria-disabled="true" aria-describedby="why">x</button></TooltipTrigger><TooltipContent>Why</TooltipContent></Tooltip>);
  expect(describedBy(html, 'aria-label="Unavailable"')).toBe("why");
});

// At the usage limit the enabled Queue button names the reset in its own sr-only description, and its tooltip says the
// same, so the open tooltip's id would read it twice.
test("Queue's own reset description stays alone while its tooltip is open", () => {
  const html = open(<SendButton action="queue" enabled sending={false} onSend={noop} description={"Sends when the limit resets at 3:00\u202fPM."} tip={"Queue — sends when the limit resets at 3:00\u202fPM"} />);
  expect(describedBy(html, 'aria-label="Queue"')).toMatch(/^[^\s]+$/);
  expect(describedBy(html, 'aria-label="Queue"')).not.toMatch(/^radix-/);
});
