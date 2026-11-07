import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
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
    header: { label: "Restart to Update", busy: false, tooltip: "Doan 0.1.1 is ready", popover: null }, disabled: false, open: false, shown: null,
    descriptionId: "hd", titleId: "ht", buttonRef: vi.fn(), onPress: vi.fn(), onOpenChange: vi.fn(), onOpenAutoFocus: vi.fn(), onCloseAutoFocus: vi.fn(), ...over,
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
    expect(tag(html(<UpdateHeaderButtonView {...props({ header: { label: "Restart to Update", busy: false, tooltip: "Doan 0.1.1 is ready", popover: BLOCKED } })} />)))
      .toMatch(/aria-haspopup="dialog" aria-expanded="false"/);
  });

  it("restarting: disabled with the spinner and Restarting", () => {
    const markup = html(<UpdateHeaderButtonView {...props({ header: { label: "Restarting", busy: true, tooltip: "Doan 0.1.1 is ready", popover: null } })} />);
    expect(tag(markup)).toContain("disabled");
    expect(markup).toContain('<span class="doan-spinner" aria-hidden="true"></span>Restarting</button>');
  });

  it("an unavailable header (locked page, modal, first run) disables it", () => {
    expect(tag(html(<UpdateHeaderButtonView {...props({ disabled: true })} />))).toContain("disabled");
  });
});

describe("UpdateHeaderButtonView popup state", () => {
  it("a stopped restart whose press restarts does not claim a popup until one is shown", () => {
    const stopped = { label: "Restart to Update", busy: false, tooltip: "Doan 0.1.1 is ready", popover: { title: "Couldn’t restart Doan.", text: "Try again, or quit and open it again." } };
    expect(tag(html(<UpdateHeaderButtonView {...props({ header: stopped })} />))).not.toContain("aria-haspopup");
    expect(tag(html(<UpdateHeaderButtonView {...props({ header: stopped, open: true, shown: stopped.popover })} />))).toMatch(/aria-haspopup="dialog" aria-expanded="true"/);
  });
});
