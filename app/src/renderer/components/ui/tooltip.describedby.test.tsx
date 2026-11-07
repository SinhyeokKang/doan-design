import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DropdownMenu } from "radix-ui";
import { expect, test, vi } from "vitest";
import type { CanvasConversationRow } from "../../canvasConversationRows";

// defect-sweep A6: five unavailable controls name their reason with their own aria-describedby (an sr-only sibling, so
// it is read while the tooltip is closed too). While the tooltip was open, Radix added its content id to that
// attribute, and the same reason was read twice. Every tooltip here is drawn open (no DOM: static markup), and each
// unavailable control must keep its own id alone; an available one still gets the open tooltip's id from Radix.
vi.mock("./tooltip", async original => {
  const actual = await original<typeof import("./tooltip")>();
  return { ...actual, Tooltip: (props: ComponentProps<typeof actual.Tooltip>) => <actual.Tooltip {...props} open /> };
});
const { TooltipProvider } = await import("./tooltip");
const { CanvasTools } = await import("../../CanvasTools");
const { RowDelete } = await import("../../CanvasConversationList");
const { ConversationDeleteItem } = await import("../../ConversationDeleteDialog");
const { RowButton } = await import("../../SettingsMcpConnectors");

const describedBy = (html: string, marker: string) => {
  const tag = html.match(new RegExp(`<(?:button|div)[^>]*${marker}[^>]*>`))?.[0];
  expect(tag, marker).toBeDefined();
  return tag!.match(/aria-describedby="([^"]*)"/)?.[1] ?? null;
};
const open = (node: React.ReactNode) => renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>);
const noop = () => {};

test("an unavailable control's open tooltip leaves its own aria-describedby alone, in all five places", () => {
  const tools = open(<CanvasTools tool="select" picking={false} capturing={false} onTool={noop} onEscape={noop}
    picker={{ enabled: true, reason: null, onToggle: noop }} capture={{ enabled: false, reason: "Open a canvas to capture an area.", onToggle: noop }}
    exporter={{ reason: "No canvas is open.", onExport: noop }} />);
  expect(describedBy(tools, 'aria-label="Capture area"')).toBe("canvas-capture-reason");
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
});

test("an available control still gets the open tooltip's id, as Radix gives it", () => {
  const tools = open(<CanvasTools tool="select" picking={false} capturing={false} onTool={noop} onEscape={noop}
    picker={{ enabled: true, reason: null, onToggle: noop }} capture={{ enabled: true, reason: null, onToggle: noop }} exporter={{ reason: null, onExport: noop }} />);
  for (const label of ["Select", "Capture area", "Export canvas"]) expect(describedBy(tools, `aria-label="${label}"`), label).toMatch(/^radix-\S+$/);
});
