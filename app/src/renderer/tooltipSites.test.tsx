import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { AttachmentDraft } from "./homeComposer";
import type { McpRowView } from "./mcpConnectorsView";

// Every tooltip drawn inline right after its trigger, as `<span data-tip="<class>">…</span>`, so static markup shows
// which control carries which words (Radix draws the capsule only after a hover, in a portal).
vi.mock("./components/ui/tooltip", async original => {
  const actual = await original<typeof import("./components/ui/tooltip")>();
  return {
    ...actual,
    Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
    TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
    TooltipContent: ({ children, className }: { children: ReactNode; className?: string }) => <span data-tip={className ?? ""}>{children}</span>,
  };
});
const { TopBar } = await import("./App");
const { WindowShell } = await import("./prototype/PrototypeWindow");
const { ShellSidebar } = await import("./ShellSidebar");
const { McpRow } = await import("./SettingsMcpConnectors");
const { CodeBlock } = await import("./ConversationThread");
const { ComposerChips, SendButton } = await import("./ComposerParts");
const { QueueRows } = await import("./DockedComposer");
const { CanvasHeader } = await import("./CanvasHeader");
const { CanvasViewStore, canvasViewFields, initialCanvasState } = await import("./CanvasController");
const { DrawerListbox, FrameRowMarks } = await import("./FrameListBody");

const noop = () => {};
const html = (node: ReactNode) => renderToStaticMarkup(<>{node}</>);
// The end of the element opened at `start`, past its matching close tag.
function elementEnd(markup: string, start: number): number {
  const name = /^<(\w+)/.exec(markup.slice(start))![1]!, tags = new RegExp(`<(/?)${name}\\b[^>]*>`, "g");
  tags.lastIndex = start;
  let depth = 0;
  for (let match = tags.exec(markup); match; match = tags.exec(markup)) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return match.index + match[0].length;
  }
  throw new Error(`unclosed <${name}>`);
}
// The tooltip drawn right after the element whose opening tag has `marker`.
function tipAfter(markup: string, marker: string): string | null {
  const at = markup.indexOf(marker);
  expect(at, marker).toBeGreaterThanOrEqual(0);
  const end = elementEnd(markup, markup.lastIndexOf("<", at));
  if (!markup.startsWith("<span data-tip=", end)) return null;
  const tip = markup.slice(end, elementEnd(markup, end));
  return tip.slice(tip.indexOf(">") + 1, -"</span>".length);
}
const tag = (markup: string, marker: string) => markup.match(new RegExp(`<\\w+[^>]*${marker}[^>]*>`))?.[0] ?? "";

const LOCK = "Settings is in the middle of a change. Finish or cancel it, then try again.";

// DESIGN 'Tooltip': every icon-only button names its action in the shared tooltip.
describe("icon-only buttons", () => {
  const topBar = (back: boolean, lockReason: string | null) => html(<TopBar sidebar={{ view: { label: "Hide sidebar", icon: "hide", badge: null }, controls: undefined, toggle: noop }} back={back} forward={false}
    previous={noop} next={noop} page={null} locked={lockReason !== null} lockReason={lockReason} reasonId="page-lock-reason" updateDisabled={false} addProjects={noop} projects={noop} settings={noop} usage={{ openSettings: () => true }} />);

  test("the main window's Back and Forward", () => {
    const markup = topBar(true, null);
    expect(tipAfter(markup, 'aria-label="Back"')).toBe("Back");
    expect(tipAfter(markup, 'aria-label="Forward"')).toBe("Forward");
  });

  // An aria-disabled control gives its reason in the tooltip and as its own description, read once.
  test("a locked page's Back shows the lock reason instead of its label", () => {
    const markup = topBar(true, LOCK);
    expect(tipAfter(markup, 'aria-label="Back"')).toBe(LOCK);
    const back = tag(markup, 'aria-label="Back"');
    expect(back).toContain('aria-disabled="true"');
    const id = /aria-describedby="([^"]+)"/.exec(back)?.[1];
    expect(markup).toContain(`<span class="sr-only" id="${id}">${LOCK}</span>`);
  });

  test("the prototype window's Back and Forward", () => {
    const view = { gen: 2, root: "/r", path: ".doan/canvases/a.html", frame: "checkout", title: "Checkout", canvas: "a", phase: "ready", mode: "fit", run: { url: "u", markWidth: 390, markHeight: 844 }, frames: [], gotos: [], canGoBack: true, canGoForward: true, previousStopped: false, panel: { open: false, width: null }, canvasRow: "present" } as const;
    const markup = html(<WindowShell view={{ ...view, frames: [], gotos: [] }} layers={{ frames: [], visible: null, snapshot: null }} readingShown={false} details={false} live="" width={640} menuOpen={false} exporting={false}
      onBack={noop} onForward={noop} onReload={noop} onReloadPress={noop} onReloadClick={noop} onMode={noop} onMenuOpen={noop} onChoose={noop} onClose={noop} onDetails={noop} onExport={noop} />);
    expect(tipAfter(markup, 'aria-label="Back"')).toBe("Back");
    expect(tipAfter(markup, 'aria-label="Forward"')).toBe("Forward");
  });

  const row: CanvasRow = { path: ".doan/canvases/onboarding-welcome-variants.html", url: "u", width: 1280 };
  const entry: Extract<FolderEntry, { kind: "list" }> = { path: "/repo", kind: "list", servedRev: 0, canvases: [row], git: { common: "/repo/.git", branch: "main", worktrees: [] } };
  const sidebar = (lockReason: string | null) => html(<ShellSidebar cards={[{ key: "common", name: "doan-design", rows: [entry] }]} projects={{ common: { roots: ["/repo"], selectedRoot: "/repo", expanded: true } }}
    loaded="/repo" canvas={row.path} homeDirectory={null} search={vi.fn()} toggle={vi.fn()} disclose={vi.fn()} toggleGroup={vi.fn()} worktree={vi.fn()} open={vi.fn()} overview={vi.fn()} action={vi.fn()}
    remove={async () => {}} projectSettings={vi.fn()} canvasMenu={{ blocked: () => false, exporting: () => false, exportCanvas: noop, trash: noop }} locked={lockReason !== null} lockReason={lockReason} />);

  test("the sidebar's project and canvas menu buttons", () => {
    const markup = sidebar(null);
    expect(tipAfter(markup, 'aria-label="doan-design menu"')).toBe("Project menu");
    expect(tipAfter(markup, 'aria-label="onboarding-welcome-variants menu"')).toBe("Canvas menu");
  });

  test("a locked page's canvas menu button shows the lock reason", () => {
    const markup = sidebar(LOCK);
    expect(tipAfter(markup, 'aria-label="onboarding-welcome-variants menu"')).toBe(LOCK);
    const id = /aria-describedby="([^"]+)"/.exec(tag(markup, 'aria-label="onboarding-welcome-variants menu"'))?.[1];
    expect(markup).toContain(`id="${id}">${LOCK}</span>`);
  });

  // A tree row's disclosure chevron is part of the row, not its own command.
  test("the sidebar's disclosure chevron has no tooltip", () => {
    expect(tipAfter(sidebar(null), 'aria-label="Collapse doan-design"')).toBeNull();
  });

  test("an added MCP server's menu button", () => {
    const view: McpRowView = { provider: "claude", name: "linear", label: "linear", url: "https://mcp.linear.app/mcp", logo: null, group: "linear, Connected", status: "Connected", button: null, helper: null, notice: null,
      menu: { label: "linear options", disabled: false, removeDisabled: false } };
    expect(tipAfter(html(<McpRow row={view} run={noop} askRemove={noop} focused={noop} runningNotice={null} />), 'aria-label="linear options"')).toBe("Server menu");
  });

  test("the thread code block's Copy", () => {
    const node = { type: "element", children: [{ type: "text", value: "doan check --json\n" }] };
    expect(tipAfter(html(<CodeBlock node={node}>{null}</CodeBlock>), 'aria-label="Copy code"')).toBe("Copy code");
  });

  test("the composer chips' remove buttons", () => {
    const file: AttachmentDraft = { key: "k1", name: "brief.md", kind: "file", pasted: false, status: "ready", size: 4096, path: "/repo/brief.md" };
    const markup = html(<ComposerChips attachments={[file]} preset={{ id: "polish", title: "Polish", group: "refine" } as never} thumbnails={{}} homeDirectory={null} disabled={false} removeButtons={{ current: [] }} onRemove={noop} />);
    expect(tipAfter(markup, 'aria-label="Remove brief.md"')).toBe("Remove attachment");
    expect(tipAfter(markup, 'aria-label="Remove preset Polish"')).toBe("Remove preset");
  });

  test("a queued message's remove button", () => {
    const markup = html(<QueueRows items={[{ id: "q1", text: "First" }]} sendNow={false} onSendNow={async () => {}} onRemove={async () => true} focusInput={noop} announce={noop} />);
    expect(tipAfter(markup, 'aria-label="Remove queued message"')).toBe("Remove queued message");
  });
});

// DESIGN 'Tooltip': a shortcut is a key chip beside the label.
describe("canvas header tooltips", () => {
  const frames = ["Cart", "Shipping"].map((title, index) => ({ id: title.toLowerCase(), title, x: 0, y: index * 900, width: 1280, height: 800 }));
  const row: CanvasRow = { path: ".doan/canvases/checkout.html", url: "doan://checkout", width: 1280 };
  const state = { ...initialCanvasState(), open: { folder: "/repo", canvas: row.path, row }, shown: row.path, status: null, message: "", hasFrame: true,
    layout: { type: "layout" as const, href: row.url, height: 1800, viewport: 1800, frames, truncated: false, gotos: [] }, currentFrame: 0, zoom: 100, scale: 1 };
  const markup = html(<CanvasHeader navigation={{ card: { key: "/repo", name: "demo", rows: [{ kind: "list", path: "/repo", servedRev: 0, canvases: [row] }] }, root: "/repo", homeDirectory: null, overview: noop, worktree: noop }} state={state} view={new CanvasViewStore(canvasViewFields(state))} command={vi.fn()} zoomTo={vi.fn()} selectFrame={vi.fn()} />);
  const keyTip = (label: string, key: string) => `${label}<span class="doan-kbd" data-ui-variant="on-prominent" data-ui-size="sm">${key}</span>`;

  test.each([["Zoom out", "⌘−"], ["Zoom in", "⌘="], ["Reload canvas", "⌘R"]])("%s shows its key %s as a chip", (label, key) => {
    expect(tipAfter(markup, `aria-label="${label}"`)).toBe(keyTip(label, key));
    expect(markup).toContain(`<span data-tip="has-key">${keyTip(label, key)}</span>`);
  });

  // Information only the tooltip carries shows on every hover: the canvas's path.
  test("the canvas name shows the canvas path, not a native title", () => {
    expect(markup).not.toContain("title=");
    expect(tipAfter(markup, 'class="doan-canvas-name"')).toBe(".doan/canvases/checkout.html");
  });
});

describe("information that only a tooltip carries", () => {
  test("frame row marks name themselves in the tooltip", () => {
    const markup = html(<FrameRowMarks current="Viewing" prototype />);
    expect(markup).not.toContain("title=");
    expect(markup).toContain('<span data-tip="">Viewing</span>');
    expect(markup).toContain('<span data-tip="">Prototype supported</span>');
  });

  test("a frame row shows its name", () => {
    const markup = html(<DrawerListbox label="Frames" groups={[{ label: "Frames", rows: [{ key: "cart", id: "cart", number: 1, name: "Cart and checkout", current: false, group: 0 }] }]} active="cart" currentWord="Viewing" onKeyDown={noop} onPick={noop} onFocusRow={noop} nodes={new Map()} />);
    expect(markup).not.toContain("title=");
    expect(markup).toContain('<span data-tip="">Cart and checkout</span>');
  });

  // Send with a reason it can't send stays focusable, so its tooltip can show the reason, once.
  test("Send that can't send gives its reason in the tooltip, not a native title", () => {
    const reason = "Choose an agent to send this message.";
    const markup = html(<SendButton enabled={false} sending={false} onSend={noop} hint={reason} />);
    const button = tag(markup, 'aria-label="Send"');
    expect(button).not.toContain("title=");
    expect(button).not.toMatch(/\sdisabled=""/);
    expect(button).toContain('aria-disabled="true"');
    expect(tipAfter(markup, 'aria-label="Send"')).toBe(reason);
  });
});
