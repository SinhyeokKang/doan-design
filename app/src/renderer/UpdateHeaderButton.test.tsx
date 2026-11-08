import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { UpdateHeaderButtonView, type UpdateHeaderButtonViewProps } from "./UpdateHeaderButton";
import { TooltipProvider } from "./components/ui/tooltip";
import { UPDATE_BLOCKED } from "../main/update/view";

// The confirmed draft .doan/canvases/app-update.html (frames header-ready, header-blocked, header-restarting,
// header-stopped, header-locked): the header's update button as drawn, without state.
// view.ts hands the button this very object while the gate is blocked.
const BLOCKED = UPDATE_BLOCKED;
function props(over: Partial<UpdateHeaderButtonViewProps> = {}): UpdateHeaderButtonViewProps {
  return {
    header: { label: "Restart to Update", busy: false, tooltip: "Doan 0.1.1 is ready", popover: null, opened: null }, disabled: false, open: false, shown: null,
    descriptionId: "hd", titleId: "ht", buttonRef: vi.fn(), contentRef: vi.fn(), onPress: vi.fn(), onOpenChange: vi.fn(), onOpenAutoFocus: vi.fn(), onCloseAutoFocus: vi.fn(), onFocusOutside: vi.fn(), ...over,
  };
}
const html = (node: ReactElement) => renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>);
const tag = (markup: string) => markup.match(/<button[^>]*update-indicator[^>]*>/)?.[0] ?? "";

describe("UpdateHeaderButtonView", () => {
  it("draws nothing inside its anchor without an update to restart into", () => {
    expect(html(<UpdateHeaderButtonView {...props({ header: null })} />)).toBe('<span class="update-anchor"></span>');
  });

  it("ready: a grey sm button with the icon and label, described by the version", () => {
    const markup = html(<UpdateHeaderButtonView {...props()} />);
    expect(markup.startsWith('<span class="update-anchor"><button')).toBe(true);
    const button = tag(markup);
    expect(button).toContain('type="button"');
    expect(button).toContain('class="doan-button update-indicator"');
    expect(button).toContain('data-ui-variant="subtle"');
    expect(button).toContain('data-ui-size="sm"');
    expect(button).toContain('aria-describedby="hd"');
    expect(button).not.toContain("aria-haspopup");
    expect(button).not.toContain("disabled");
    expect(markup).toMatch(/<svg[^>]*lucide-circle-fading-arrow-up[^>]*aria-hidden="true"[^>]*>.*<\/svg>Restart to Update<\/button>/);
    expect(markup).toContain('<span class="sr-only" id="hd">Doan 0.1.1 is ready</span>');
  });

  it("a state whose press may open the popover carries aria-haspopup and aria-expanded", () => {
    expect(tag(html(<UpdateHeaderButtonView {...props({ header: { label: "Restart to Update", busy: false, tooltip: "Doan 0.1.1 is ready", popover: BLOCKED, opened: BLOCKED } })} />)))
      .toMatch(/aria-haspopup="dialog" aria-expanded="false"/);
  });

  it("restarting: disabled with the spinner and Restarting", () => {
    const markup = html(<UpdateHeaderButtonView {...props({ header: { label: "Restarting", busy: true, tooltip: "Doan 0.1.1 is ready", popover: null, opened: null } })} />);
    expect(tag(markup)).toContain("disabled");
    expect(markup).toContain('<span class="doan-spinner" aria-hidden="true"></span>Restarting</button>');
  });

  it("an unavailable header (locked page, modal, first run) disables it", () => {
    expect(tag(html(<UpdateHeaderButtonView {...props({ disabled: true })} />))).toContain("disabled");
  });
});

describe("UpdateHeaderButtonView popup state", () => {
  it("a stopped restart whose press restarts does not claim a popup until one is shown", () => {
    const stopped = { label: "Restart to Update", busy: false, tooltip: "Doan 0.1.1 is ready", popover: { title: "Couldn’t restart Doan.", text: "Try again, or quit and open it again." }, opened: null };
    expect(tag(html(<UpdateHeaderButtonView {...props({ header: stopped })} />))).not.toContain("aria-haspopup");
    expect(tag(html(<UpdateHeaderButtonView {...props({ header: stopped, open: true, shown: stopped.popover })} />))).toMatch(/aria-haspopup="dialog" aria-expanded="true"/);
  });
});

// The portal does not render to static markup, so this walks the element tree the view returns.
function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Object.values(node.props).flatMap(value => Array.isArray(value) || isValidElement(value) ? all(value as ReactNode) : [])];
}

describe("UpdateHeaderButtonView popover words", () => {
  // Draft frames popover-unblocked and popover-stopped-blocked: the words are one polite live region, so a change
  // while open is read once without moving focus.
  it("the title and text sit in one polite live region inside the dialog", () => {
    const tree = all(UpdateHeaderButtonView(props({ open: true, shown: BLOCKED })));
    const region = tree.find(element => element.props.className === "update-pop-live")!;
    expect(region.props["aria-live"]).toBe("polite");
    const inside = all(region.props.children as ReactNode);
    expect(inside.find(element => element.props.className === "update-pop-title")?.props).toMatchObject({ id: "ht", children: BLOCKED.title });
    expect(inside.find(element => element.props.className === "update-pop-text")?.props.children).toBe(BLOCKED.text);
    expect(tree.find(element => element.props.role === "dialog")?.props["aria-labelledby"]).toBe("ht");
  });
});
