import type { ReactNode } from "react";
import { renderToStaticMarkup as serverMarkup } from "react-dom/server";
// Names and details show in the shared tooltip, which needs the app's provider.
const renderToStaticMarkup = (node: ReactNode) => serverMarkup(<TooltipProvider>{node}</TooltipProvider>);
import { describe, expect, it, test, vi } from "vitest";
import { TooltipProvider } from "./components/ui/tooltip";
import { groupSlot, projectSlot, recoveryKey, ShellSidebar, staleMenu } from "./ShellSidebar";
import type { FolderEntry } from "../main/view";
import type { SidebarSlot as Slot } from "./canvasNotice";
import type { CanvasMenu } from "./ShellSidebar";
const NO_CANVAS_MENU: CanvasMenu = { blocked: () => false, exporting: () => false, exportCanvas: () => {}, trash: () => {} };
const row = { path: ".doan/canvases/folder/canvas.html", url: "u", frames: [{ id: "hidden-frame" }] };
const entry: Extract<FolderEntry, { kind: "list" }> = { path: "/repo", kind: "list", servedRev: 0, canvases: [row], git: { common: "/repo/.git", branch: "main", worktrees: [] } };
function render(loaded: string | null, selected = "/repo", expanded = false, problem = false, unlisted = false) {
  const first: FolderEntry = problem ? { ...entry, canvases: [{ ...row, error: { code: "bad", message: "Unreadable" } }] } : entry;
  return renderToStaticMarkup(<ShellSidebar cards={[{ key: "common", name: "demo", rows: [first, { ...entry, path: "/other", canvases: [] }] }]} projects={{ common: { roots: ["/repo", "/other"], selectedRoot: selected, expanded } }} loaded={loaded} unlisted={unlisted} canvas={loaded ? row.path : undefined} homeDirectory={null} search={vi.fn()} toggle={vi.fn()} disclose={vi.fn()} toggleGroup={vi.fn()} worktree={vi.fn()} open={vi.fn()} overview={vi.fn()} action={vi.fn()} remove={async () => {}} projectSettings={vi.fn()} canvasMenu={NO_CANVAS_MENU} />);
}
it("renders project to canvas IA, locks current expansion, and makes the branch a worktree menu", () => {
  const html = render("/repo");
  expect(html).toContain('aria-expanded="true"');
  expect(html).toContain('aria-label="canvas"');
  expect(html).toContain('data-key="/repo\n.doan/canvases/folder/canvas.html"');
  expect(html).not.toContain("hidden-frame");
  expect(html).not.toContain('aria-label="Overview"');
  expect(html).toContain('data-ui-variant="translucent"');
  expect(html).toMatch(/<button[^>]*aria-label="Worktree: main"[^>]*tabindex="0"[^>]*aria-haspopup="menu"/);
  expect(html).toContain('aria-label="demo menu"');
});
it("shows only the remembered worktree and keeps other projects collapsed", () => {
  expect(render(null)).not.toContain('aria-label="canvas"');
  expect(render(null, "/other", true)).toContain("No canvases yet");
  expect(render(null, "/other", true)).not.toContain('aria-label="canvas"');
});
it("shows an unreadable canvas's sentence and Details under its row", () => {
  const html = render("/repo", "/repo", true, true);
  expect(html).toContain("Can’t read this canvas. Run doan check in a terminal.");
  expect(html).toContain('aria-label="Details"');
});

// Comment counts are not part of a canvas row's description.
it("does not describe a canvas row by its open comments", () => {
  expect(render("/repo")).not.toContain("open comment");
});

it("does not mark a canvas or Overview current for an unlisted iframe destination", () => {
  expect(render("/repo", "/repo", true, false, true)).not.toContain('aria-current="location"');
});

it("draws every project hue as a light tint with dark ink, shared with onboarding thumbnails", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  for (const hue of ["rose", "orange", "amber", "emerald", "teal", "sky", "indigo", "fuchsia"])
    expect(css).toContain(`.hue-${hue} { background: color-mix(in srgb, var(--identity-project-${hue}) 14%, var(--surface-panel)); color: color-mix(in srgb, var(--identity-project-${hue}) 65%, var(--text-standard)); }`);
  expect(css).not.toMatch(/\.shell-thumbnail \{[^}]*color:/);
  expect(render("/repo")).toContain('<span class="shell-thumbnail hue-');
});

// No rules stay for classes no component renders (section heads, counts, hints, breadcrumbs, branch button, two-line rows).
it("keeps no rules for the first shell's unrendered classes", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).not.toMatch(/(^|\n)\.(meta|sec|cnt|hint|crumbs|branch)\b/);
  expect(css).not.toMatch(/\.ob-field \.value \.meta\b|\.row \.d \{|\.side \.row \.(tw|two)\b/);
});

// PRODUCT §5: the chevron shows on hover or keyboard focus. A mouse click focuses the row (a treeitem), so :focus-within
// kept the chevron after the pointer left; only focus-visible focus may show it.
it("shows the project row's chevron on hover or keyboard focus, not on focus left by a click", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toContain(".shell-project-row:is(:hover, :focus-visible, :has(:focus-visible)) .shell-disclosure { visibility: visible; }");
  // Only a row with a chevron gives its thumbnail's place to it; a problem or reading row has none and keeps its
  // thumbnail, or its lead would go empty on hover.
  expect(css).toContain(".shell-project-row:is(:hover, :focus-visible, :has(:focus-visible)) .shell-lead:has(> .shell-disclosure) > .shell-thumbnail { visibility: hidden; }");
  expect(css).not.toMatch(/\.shell-project-row:[^{]*\.shell-lead > \.shell-thumbnail \{ visibility: hidden/);
  expect(css).not.toMatch(/\.shell-project-row:[^{]*focus-within/);
});

it("keeps every thumbnail letter readable on its tint, for the sidebar's 10px letter too", async () => {
  const { readFileSync } = await import("node:fs");
  const { contrastPairs } = await import("./ds/checks");
  const tokens = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
  const hues = ["rose", "orange", "amber", "emerald", "teal", "sky", "indigo", "fuchsia"];
  // The palette is oklch, which the checker does not parse: each hue's step 600 is converted to sRGB hex here.
  const hex = (l: number, c: number, hDeg: number) => {
    const a = c * Math.cos(hDeg * Math.PI / 180), b = c * Math.sin(hDeg * Math.PI / 180);
    const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3, m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3, s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const lin = [4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_, -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_, -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_];
    return "#" + lin.map(v => { const x = Math.min(1, Math.max(0, v)); const g = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055; return Math.round(g * 255).toString(16).padStart(2, "0"); }).join("");
  };
  const palette = hues.map(h => {
    const match = new RegExp(`--${h}-600: oklch\\(([\\d.]+)% ([\\d.]+) ([\\d.]+)\\)`).exec(tokens);
    if (!match) throw new Error(`--${h}-600 is not oklch`);
    return `--${h}-600: ${hex(Number(match[1]) / 100, Number(match[2]), Number(match[3]))};`;
  }).join(" ");
  const extra = `:root { ${palette} ${hues.map(h => `--t-bg-${h}: color-mix(in srgb, var(--identity-project-${h}) 14%, var(--surface-panel)); --t-ink-${h}: color-mix(in srgb, var(--identity-project-${h}) 65%, var(--text-standard));`).join(" ")} }`;
  const results = contrastPairs(`${tokens}\n${extra}`, hues.map(h => ({ fg: `--t-ink-${h}`, bg: `--t-bg-${h}`, kind: "body" as const })));
  expect(results.filter(r => !r.ok).map(r => `${r.fg} ${r.wcag.toFixed(2)} Lc ${r.apca.toFixed(0)}`)).toEqual([]);
});

// Home shows the sidebar without a current row, the status slot sits at the right of
// a row (before a project's menu), and an added project's row flashes.
test("on Home no row is current; the slot shows a permission hand, a spinner or an unseen Dot with its label", () => {
  const Sidebar = ShellSidebar;
  const canvas = { path: ".doan/canvases/a.html", url: "u" };
  const entries: FolderEntry[] = [{ path: "/a", kind: "list", servedRev: 0, canvases: [canvas] }, { path: "/b", kind: "list", servedRev: 0, canvases: [] }];
  const props = { cards: [{ key: "a", name: "alpha", rows: [entries[0]!] }, { key: "b", name: "beta", rows: [entries[1]!] }], projects: { a: { roots: ["/a"], expanded: true } }, loaded: "/a", canvas: canvas.path, homeDirectory: null, search: () => {}, toggle: () => {}, disclose: () => {}, toggleGroup: () => {}, worktree: () => {}, open: () => {}, overview: () => {}, action: () => {}, remove: async () => {}, projectSettings: () => {}, canvasMenu: NO_CANVAS_MENU };
  const slots = new Map([["/a\n.doan/canvases/a.html", { kind: "working" as const, label: "Claude Code is working" }], ["/b", { kind: "permission" as const, label: "Codex needs your answer" }]]);
  const home = renderToStaticMarkup(<Sidebar {...props} home homeCurrent slots={slots} highlight={["/b"]} />);
  // Only the Home row is current on Home; no project or canvas row is.
  expect(home.replace(/<button type="button" class="shell-home-row row" aria-current="page">/, "")).not.toContain("aria-current");
  expect(home).toContain('<span data-state="closed" data-slot="tooltip-trigger">a</span><span class="row-slot working" role="img" aria-label="Claude Code is working"><span class="doan-spinner" aria-hidden="true"></span></span>');
  expect(home).toMatch(/class="shell-project-row row flash"[^>]*aria-label="beta"/);
  expect(home).toMatch(/<span class="shell-project-name" data-state="closed" data-slot="tooltip-trigger">beta<\/span><span class="row-slot permission" role="img" aria-label="Codex needs your answer"><svg[^>]*lucide-hand/);
  expect(renderToStaticMarkup(<Sidebar {...props} />)).toContain('aria-current="location"');
  const unseen = renderToStaticMarkup(<Sidebar {...props} slots={new Map([["/b", { kind: "unseen" as const, label: "Conversation finished — unread" }]])} />);
  // A finished conversation is a speech bubble; only a canvas change stays the accent dot.
  expect(unseen).toMatch(/<span class="row-slot ended" role="img" aria-label="Conversation finished — unread"><svg[^>]*lucide-message-circle/);
  expect(unseen).not.toContain("<i></i>");
  const changed = renderToStaticMarkup(<Sidebar {...props} slots={new Map([["/b", { kind: "canvas" as const, label: "x changed since you last opened it" }]])} />);
  expect(changed).toContain('<span class="row-slot unseen" role="img" aria-label="x changed since you last opened it"><i></i></span>');
});

test("a project row carries a bound canvas's slot only while that canvas row is not shown, the highest state first", () => {
  const slots = new Map([["/a\n.doan/canvases/x.html", { kind: "unseen" as const, label: "u" }], ["/a", { kind: "working" as const, label: "w" }], ["/b", { kind: "permission" as const, label: "p" }]]);
  expect(projectSlot(slots, ["/a"], [])).toEqual({ kind: "working", label: "w" });
  expect(projectSlot(new Map([["/a\n.doan/canvases/x.html", { kind: "permission" as const, label: "p" }]]), ["/a"], [])).toEqual({ kind: "permission", label: "p" });
  expect(projectSlot(new Map([["/a\n.doan/canvases/x.html", { kind: "permission" as const, label: "p" }]]), ["/a"], ["/a\n.doan/canvases/x.html"])).toBeUndefined();
});

// Two groups under an expanded, listed project. `others`: more worktrees of the project, after the selected `/a`.
function groups(canvases: string[], closed?: { ds?: false; canvases?: false }, extra: { slots?: Map<string, Slot>; entry?: FolderEntry; others?: FolderEntry[]; expanded?: boolean; locked?: boolean } = {}) {
  const listed: FolderEntry = extra.entry ?? { path: "/a", kind: "list", servedRev: 0, canvases: canvases.map(name => ({ path: `.doan/${name}.html`, url: name })) };
  const rows = [listed, ...(extra.others ?? [])];
  return renderToStaticMarkup(<TooltipProvider><ShellSidebar cards={[{ key: "common", name: "demo", rows }]} projects={{ common: { roots: rows.map(row => row.path), selectedRoot: "/a", expanded: extra.expanded ?? true, ...(closed ? { groups: closed } : {}) } }} loaded={null} canvas={undefined} homeDirectory={null} {...(extra.slots ? { slots: extra.slots } : {})} {...(extra.locked ? { locked: true } : {})}
    search={vi.fn()} toggle={vi.fn()} disclose={vi.fn()} toggleGroup={vi.fn()} worktree={vi.fn()} open={vi.fn()} overview={vi.fn()} action={vi.fn()} remove={async () => {}} projectSettings={vi.fn()} canvasMenu={NO_CANVAS_MENU} /></TooltipProvider>);
}
const heads = (html: string) => [...html.matchAll(/<div class="shell-group-head row"[^>]*>.*?<\/div>/g)].map(match => match[0]);

test("an expanded project shows Design system, then Canvases, each head a level-2 tree item with its label, count badge and description", () => {
  const html = groups(["ds/button", "ds/color", "canvases/checkout"]);
  const [ds, canvases] = heads(html);
  expect(ds).toMatch(/role="treeitem"/);
  expect(ds).toMatch(/aria-label="Design system"/);
  expect(ds).toMatch(/aria-level="2"/);
  expect(ds).toMatch(/aria-expanded="true"/);
  expect(ds).toMatch(/<svg[^>]*lucide-chevron-down/);
  expect(ds).toContain('<span class="doan-chip shell-group-count" data-ui-variant="translucent" aria-hidden="true">2</span>');
  expect(canvases).toMatch(/aria-label="Canvases"/);
  expect(canvases).toContain(">1</span>");
  const described = ds!.match(/aria-describedby="([^"]+)"/)![1]!;
  expect(html).toContain(`<span id="${described}" class="sr-only">2 canvases</span>`);
  expect(html).toContain(">1 canvas</span>");
  expect(html.indexOf('aria-label="Design system"')).toBeLessThan(html.indexOf('aria-label="Canvases"'));
  expect(html.match(/aria-level="3"/g)).toHaveLength(3);
});

test("design-system rows take SwatchBook and canvas rows PanelsTopLeft; Palette is gone", () => {
  const html = groups(["ds/button", "canvases/checkout"]);
  expect(html).toMatch(/aria-label="button"[^>]*><svg[^>]*lucide-swatch-book/);
  expect(html).toMatch(/aria-label="checkout"[^>]*><svg[^>]*lucide-panels-top-left/);
  expect(html).not.toContain("lucide-palette");
});

test("an empty group keeps its head and 0 badge and shows its own line while open", () => {
  const onlyCanvases = groups(["canvases/checkout"]);
  expect(onlyCanvases).toContain('<p class="shell-empty">No design system yet</p>');
  expect(heads(onlyCanvases)[0]).toContain(">0</span>");
  const onlyDs = groups(["ds/button"]);
  expect(onlyDs).toContain('<p class="shell-empty">No canvases yet</p>');
  const neither = groups([]);
  expect(neither).toContain("No design system yet");
  expect(neither).toContain("No canvases yet");
  expect(neither).toContain(">0 canvases</span>");
  expect(groups([], { ds: false })).not.toContain("No design system yet");
});

test("a closed group hides its rows and turns its chevron; the other group stays open", () => {
  const html = groups(["ds/button", "canvases/checkout"], { ds: false });
  expect(heads(html)[0]).toMatch(/aria-expanded="false"/);
  expect(heads(html)[1]).toMatch(/aria-expanded="true"/);
  expect(html).not.toContain('aria-label="button"');
  expect(html).toContain('aria-label="checkout"');
});

// PRODUCT §5 item 1: a project that could not be listed shows an icon in its slot, not a status line.
const PROBLEMS: [FolderEntry, string, string][] = [
  [{ path: "/a", kind: "notFound" }, "lucide-folder-x", "demo is missing"],
  [{ path: "/a", kind: "uninitialized" }, "lucide-folder-cog", "demo isn’t set up"],
  [{ path: "/a", kind: "error", message: "bad config", config: "/a/.doan/config.json" }, "lucide-file-", "Doan couldn’t read demo’s configuration"],
  [{ path: "/a", kind: "cliError", reason: "offline" }, "lucide-square-terminal", "Doan couldn’t read demo"],
];
// The row's own tag: the project menu's trigger inside it carries its own aria-expanded.
const rowTag = (row: string) => /^<div[^>]*>/.exec(row)![0];
const projectRow = (html: string) => /<div class="shell-project-row[^>]*>.*?<\/button><\/div>/s.exec(html)![0];

test.each(PROBLEMS)("a project that could not be listed shows its kind's icon and sentence, with no chevron, group or status line (%j)", (entry, icon, sentence) => {
  const html = groups([], undefined, { entry });
  const row = projectRow(html);
  expect(row).toMatch(/<span class="row-slot problem"[^>]*aria-hidden="true"[^>]*><svg[^>]*aria-hidden="true"/);
  expect(row).toContain(icon);
  const described = row.match(/aria-describedby="([^"]+)"/)![1]!;
  expect(row).toContain(`<span id="${described}" class="sr-only">${sentence}</span>`);
  expect(row).toContain('aria-label="demo"');
  expect(rowTag(row)).not.toContain("aria-expanded");
  expect(row).not.toContain("shell-disclosure");
  expect(row).not.toContain("shell-problem");
  expect(html).not.toContain("shell-group-head");
  expect(html).not.toContain("shell-empty");
  expect(html).not.toContain('role="group"');
});

test("a listed project keeps its chevron, aria-expanded and no state description", () => {
  const row = projectRow(groups(["canvases/checkout"]));
  expect(rowTag(row)).toContain('aria-expanded="true"');
  expect(row).toContain("shell-disclosure");
  expect(row).not.toContain("aria-describedby");
  expect(row).not.toContain("sr-only");
});

test("a project still loading draws no spinner before the delay, and is not expandable meanwhile", () => {
  const html = groups([], undefined, { entry: { path: "/a", kind: "loading" } });
  expect(html).not.toContain("row-slot");
  expect(html).not.toContain("aria-describedby");
  expect(rowTag(projectRow(html))).not.toContain("aria-expanded");
  expect(html).not.toContain("shell-disclosure");
  expect(html).not.toContain('role="group"');
});

// PRODUCT §5 item 1 order: permission request or question, problem icon, working, unseen.
describe("what wins the slot of a project in a problem state", () => {
  const entry: FolderEntry = { path: "/a", kind: "notFound" };
  const slotsOf = (key: string, slot: Slot) => new Map([[key, slot]]);
  const drawn = (slot: Slot, key = "/a\n.doan/canvases/x.html") => projectRow(groups([], undefined, { entry, slots: slotsOf(key, slot) }));
  test("a permission request wins, whichever worktree holds it, and the row keeps its problem description", () => {
    for (const key of ["/a\n.doan/canvases/x.html", "/b\n.doan/canvases/x.html"]) {
      const row = projectRow(renderToStaticMarkup(<TooltipProvider><ShellSidebar cards={[{ key: "common", name: "demo", rows: [entry, { ...entry, path: "/b", kind: "list", servedRev: 0, canvases: [] } as FolderEntry] }]} projects={{ common: { roots: ["/a", "/b"], selectedRoot: "/a", expanded: true } }} loaded={null} canvas={undefined} homeDirectory={null} slots={slotsOf(key, { kind: "permission", label: "Codex needs your answer" })}
        search={vi.fn()} toggle={vi.fn()} disclose={vi.fn()} toggleGroup={vi.fn()} worktree={vi.fn()} open={vi.fn()} overview={vi.fn()} action={vi.fn()} remove={async () => {}} projectSettings={vi.fn()} canvasMenu={NO_CANVAS_MENU} /></TooltipProvider>));
      expect(row).toContain('<span class="row-slot permission" role="img" aria-label="Codex needs your answer">');
      expect(row).not.toContain("row-slot problem");
      expect(row).toContain("demo is missing</span>");
    }
  });
  test("the problem icon wins over working, unseen and a canvas notice", () => {
    for (const slot of [{ kind: "working", label: "Codex is working" }, { kind: "unseen", label: "Codex finished" }, { kind: "canvas", label: "x is new" }] as Slot[]) {
      const row = drawn(slot);
      expect(row).toContain("row-slot problem");
      expect(row).not.toContain(`row-slot ${slot.kind === "canvas" ? "unseen" : slot.kind === "unseen" ? "ended" : slot.kind}`);
    }
  });
});

// PRODUCT §5 item 1: a canvas row's slot shows once, on the nearest rendered row: its own, else its closed group's head,
// else (project collapsed) the project row.
test("a slot in a closed group shows on its group head, not the project row; open, it stays on its own row", () => {
  const slots = new Map([["/a\n.doan/ds/button.html", { kind: "permission" as const, label: "Codex needs your answer" }]]);
  const closed = groups(["ds/button", "canvases/checkout"], { ds: false }, { slots });
  expect(projectRow(closed)).not.toContain("row-slot");
  expect(heads(closed)[0]).toContain('<span class="row-slot permission" role="img" aria-label="Codex needs your answer"><svg');
  expect(heads(closed)[1]).not.toContain("row-slot");
  const open = groups(["ds/button", "canvases/checkout"], undefined, { slots });
  expect(projectRow(open)).not.toContain("row-slot");
  expect(open).toMatch(/<span data-state="closed" data-slot="tooltip-trigger">button<\/span><span class="row-slot permission"/);
  for (const head of heads(open)) expect(head).not.toContain("row-slot");
  expect(closed.match(/row-slot permission/g)).toHaveLength(1);
});

test("a closed head's slot sits last, after the count badge, inside the head's tree item", () => {
  const slots = new Map([["/a\n.doan/canvases/checkout.html", { kind: "working" as const, label: "Codex is working" }]]);
  const head = heads(groups(["ds/button", "canvases/checkout"], { canvases: false }, { slots }))[1]!;
  expect(head).toMatch(/^<div class="shell-group-head row" role="treeitem"/);
  expect(head).toMatch(/<span class="doan-chip shell-group-count" data-ui-variant="translucent" aria-hidden="true">1<\/span><span class="row-slot working" role="img" aria-label="Codex is working"><span class="doan-spinner" aria-hidden="true"><\/span><\/span><span id="[^"]+" class="sr-only">1 canvas<\/span><\/div>$/);
});

test.each([
  [{ kind: "permission", label: "Codex needs your answer" }, /<span class="row-slot permission" role="img" aria-label="Codex needs your answer"><svg[^>]*lucide-hand/],
  [{ kind: "working", label: "Claude Code is working" }, /<span class="row-slot working" role="img" aria-label="Claude Code is working"><span class="doan-spinner"/],
  [{ kind: "working", label: "Codex is working in a terminal", source: "terminal" }, /<span class="row-slot working" role="img" aria-label="Codex is working in a terminal"><span class="doan-spinner"/],
  [{ kind: "scheduled", label: "Queued — sending" }, /<span class="row-slot scheduled" role="img" aria-label="Queued — sending"><svg[^>]*lucide-clock/],
  [{ kind: "unseen", label: "Conversation finished — unread" }, /<span class="row-slot ended" role="img" aria-label="Conversation finished — unread"><svg[^>]*lucide-message-circle/],
  [{ kind: "canvas", label: "button changed since you last opened it" }, /<span class="row-slot unseen" role="img" aria-label="button changed since you last opened it"><i><\/i><\/span>/],
] as [Slot, RegExp][])("a closed head shows each kind of canvas slot as the canvas row would (%j)", (slot, mark) => {
  const html = groups(["ds/button"], { ds: false }, { slots: new Map([["/a\n.doan/ds/button.html", slot]]) });
  expect(heads(html)[0]).toMatch(mark);
  expect(projectRow(html)).not.toContain("row-slot");
});

test("with both groups closed each head shows its own canvases' slot and the project row only its own", () => {
  const slots = new Map<string, Slot>([
    ["/a", { kind: "scheduled", label: "Queued — sending" }],
    ["/a\n.doan/ds/button.html", { kind: "permission", label: "Codex needs your answer" }],
    ["/a\n.doan/canvases/checkout.html", { kind: "unseen", label: "Conversation finished — unread" }],
  ]);
  const html = groups(["ds/button", "canvases/checkout"], { ds: false, canvases: false }, { slots });
  expect(heads(html)[0]).toContain('aria-label="Codex needs your answer"');
  expect(heads(html)[0]).not.toContain("row-slot ended");
  expect(heads(html)[1]).toContain('<span class="row-slot ended" role="img" aria-label="Conversation finished — unread">');
  expect(heads(html)[1]).not.toContain("row-slot permission");
  expect(projectRow(html)).toContain('<span class="row-slot scheduled" role="img" aria-label="Queued — sending">');
});

test("the project row keeps other worktrees' canvases and canvases not in the list while a group is closed", () => {
  const other: FolderEntry = { path: "/b", kind: "list", servedRev: 0, canvases: [{ path: ".doan/ds/button.html", url: "b" }] };
  const elsewhere = groups(["ds/button"], { ds: false }, { others: [other], slots: new Map([["/b\n.doan/ds/button.html", { kind: "permission", label: "Codex needs your answer" }]]) });
  expect(projectRow(elsewhere)).toContain('aria-label="Codex needs your answer"');
  for (const head of heads(elsewhere)) expect(head).not.toContain("row-slot");
  const unlisted = groups(["ds/button"], { ds: false }, { slots: new Map([["/a\n.doan/ds/gone.html", { kind: "working", label: "Codex is working" }]]) });
  expect(projectRow(unlisted)).toContain('aria-label="Codex is working"');
  for (const head of heads(unlisted)) expect(head).not.toContain("row-slot");
});

test("an empty closed group's head shows no slot", () => {
  const html = groups(["canvases/checkout"], { ds: false }, { slots: new Map([["/a\n.doan/canvases/checkout.html", { kind: "working", label: "Codex is working" }], ["/a", { kind: "unseen", label: "Conversation finished — unread" }]]) });
  expect(heads(html)[0]).not.toContain("row-slot");
  expect(html).toContain('aria-label="checkout"');
});

test("a collapsed project's row still shows its canvases' strongest slot, whatever its groups' state", () => {
  const slots = new Map<string, Slot>([["/a\n.doan/canvases/checkout.html", { kind: "working", label: "Codex is working" }], ["/a\n.doan/ds/button.html", { kind: "permission", label: "Codex needs your answer" }]]);
  for (const closed of [undefined, { ds: false as const }, { ds: false as const, canvases: false as const }]) {
    const html = groups(["ds/button", "canvases/checkout"], closed, { slots, expanded: false });
    expect(heads(html)).toEqual([]);
    expect(projectRow(html)).toContain('<span class="row-slot permission" role="img" aria-label="Codex needs your answer">');
  }
});

test("a locked page's closed head keeps its slot and its own colour class; the head stays the tree item that toggles", () => {
  const html = groups(["ds/button"], { ds: false }, { locked: true, slots: new Map([["/a\n.doan/ds/button.html", { kind: "permission", label: "Codex needs your answer" }]]) });
  expect(heads(html)[0]).toMatch(/aria-disabled="true"/);
  expect(heads(html)[0]).toContain('<span class="row-slot permission" role="img" aria-label="Codex needs your answer">');
});

// A slot's hand, clock or bubble must not turn −90° with a closed group or take the metadata or disabled ink instead of its own
// colour.
it("CSS: the group head's chevron rules reach only the chevron, never the slot's icon", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).not.toMatch(/\.shell-group-head(\[[^\]]*\])? svg \{[^}]*\b(transform|color):/);
  expect(css).not.toMatch(/\.shell-group-head\[aria-disabled="true"\] :is\([^)]*\bsvg\b/);
  expect(css).toMatch(/\.shell-group-head\[aria-expanded="false"\] > svg \{ transform: rotate\(-90deg\); \}/);
  // Nothing hides a head's slot on hover or focus (a head has no menu to take its place).
  expect(css).not.toMatch(/\.shell-group-head[^{]*\.row-slot[^{]*\{[^}]*(clip-path|display: none|visibility: hidden)/);
});

it("puts a Home row above the projects, current only on Home", () => {
  const html = render("/repo");
  expect(html).toMatch(/<button[^>]*class="shell-home-row row"[^>]*>.*Home<\/span><\/button>.*shell-projects-heading/s);
  expect(html).not.toMatch(/class="shell-home-row row"[^>]*aria-current/);
  const onHome = renderToStaticMarkup(<ShellSidebar cards={[]} projects={{}} loaded={null} canvas={undefined} homeDirectory={null} home homeCurrent search={vi.fn()} toggle={vi.fn()} disclose={vi.fn()} toggleGroup={vi.fn()} worktree={vi.fn()} open={vi.fn()} overview={vi.fn()} action={vi.fn()} remove={vi.fn()} projectSettings={vi.fn()} canvasMenu={NO_CANVAS_MENU} goHome={vi.fn()} />);
  expect(onHome).toMatch(/class="shell-home-row row"[^>]*aria-current="page"/);
  // A page shows Home's sidebar (no current project or canvas) without being Home.
  const onPage = renderToStaticMarkup(<ShellSidebar cards={[]} projects={{}} loaded={null} canvas={undefined} homeDirectory={null} home search={vi.fn()} toggle={vi.fn()} disclose={vi.fn()} toggleGroup={vi.fn()} worktree={vi.fn()} open={vi.fn()} overview={vi.fn()} action={vi.fn()} remove={vi.fn()} projectSettings={vi.fn()} canvasMenu={NO_CANVAS_MENU} goHome={vi.fn()} />);
  expect(onPage).not.toContain("aria-current");
});

// Both sidebar views take the shared thin `.doan-scroll`, as the panels do.
it("scrolls the project list and the Settings categories with the shared thin scrollbar", () => {
  expect(render("/repo")).toContain('<div class="shell-projects doan-scroll">');
  const settings = renderToStaticMarkup(<ShellSidebar cards={[]} projects={{}} loaded={null} canvas={undefined} homeDirectory={null} search={vi.fn()} toggle={vi.fn()} disclose={vi.fn()} toggleGroup={vi.fn()} worktree={vi.fn()} open={vi.fn()} overview={vi.fn()} action={vi.fn()} remove={vi.fn()} projectSettings={vi.fn()} canvasMenu={NO_CANVAS_MENU} settings={{ section: "agents", select: vi.fn() }} />);
  expect(settings).toContain('<div class="shell-projects doan-scroll">');
});

// A canvas notice is the same violet dot, under every conversation state.
test("a canvas notice is the unseen dot on its row, and on its group head while that group is closed", () => {
  const notice = { kind: "canvas" as const, label: "button changed since you last opened it" };
  const slots = new Map([["/a\n.doan/ds/button.html", notice]]);
  const open = groups(["ds/button", "canvases/checkout"], undefined, { slots });
  expect(open).toContain('<span data-state="closed" data-slot="tooltip-trigger">button</span><span class="row-slot unseen" role="img" aria-label="button changed since you last opened it"><i></i></span>');
  expect(open).not.toMatch(/<span class="shell-project-name" data-state="closed" data-slot="tooltip-trigger">demo<\/span><span class="row-slot/);
  const closed = groups(["ds/button", "canvases/checkout"], { ds: false }, { slots });
  expect(heads(closed)[0]).toContain('<span class="row-slot unseen" role="img" aria-label="button changed since you last opened it"><i></i></span>');
  expect(projectRow(closed)).not.toContain("row-slot");
  const collapsed = groups(["ds/button", "canvases/checkout"], { ds: false }, { slots, expanded: false });
  expect(collapsed).toMatch(/<span class="shell-project-name" data-state="closed" data-slot="tooltip-trigger">demo<\/span><span class="row-slot unseen" role="img" aria-label="button changed since you last opened it"><i><\/i><\/span>/);
});

// A closed group's head ranks its canvases' slots as the project row does, and a canvas notice standing for several names
// the first in `slots`, the most recently changed (canvasNotice.ts).
describe("groupSlot", () => {
  const group = (id: "ds" | "canvases", paths: string[], open = false) => ({ id, label: id, empty: "", open, rows: paths.map(path => ({ path, url: path })) });
  const DS = [".doan/ds/button.html", ".doan/ds/color.html"];
  test("an open group's head carries nothing", () => {
    expect(groupSlot(new Map([["/a\n.doan/ds/button.html", { kind: "permission", label: "p" }]]), "/a", group("ds", DS, true))).toBeUndefined();
  });
  test("a closed group's head carries its strongest canvas slot: permission, working, a usage-limit wait, unseen, then a canvas notice", () => {
    const kinds: Slot[] = [{ kind: "canvas", label: "c" }, { kind: "unseen", label: "u" }, { kind: "scheduled", label: "s" }, { kind: "working", label: "w" }, { kind: "permission", label: "p" }];
    // The weaker slot comes first in the map, so a win is the rank, not the order.
    for (let i = 1; i < kinds.length; i++)
      expect(groupSlot(new Map([["/a\n.doan/ds/button.html", kinds[i - 1]!], ["/a\n.doan/ds/color.html", kinds[i]!]]), "/a", group("ds", DS))).toBe(kinds[i]);
    const slots = new Map<string, Slot>([["/a\n.doan/ds/button.html", { kind: "unseen", label: "u" }], ["/a\n.doan/ds/color.html", { kind: "permission", label: "p" }]]);
    expect(groupSlot(slots, "/a", group("ds", DS))).toEqual({ kind: "permission", label: "p" });
    const working = new Map<string, Slot>([["/a\n.doan/ds/button.html", { kind: "scheduled", label: "s" }], ["/a\n.doan/ds/color.html", { kind: "working", label: "w", source: "terminal" }]]);
    expect(groupSlot(working, "/a", group("ds", DS))).toEqual({ kind: "working", label: "w", source: "terminal" });
  });
  test("among equals the first in the slots wins, so several notices name the most recently changed canvas", () => {
    const first: Slot = { kind: "canvas", label: "color changed" }, second: Slot = { kind: "canvas", label: "button changed" };
    expect(groupSlot(new Map([["/a\n.doan/ds/color.html", first], ["/a\n.doan/ds/button.html", second]]), "/a", group("ds", DS))).toBe(first);
  });
  test("only the group's own canvases in this root count: not the project's own slot, another worktree, the other group or an unlisted canvas", () => {
    const slots = new Map<string, Slot>([
      ["/a", { kind: "permission", label: "project" }],
      ["/b\n.doan/ds/button.html", { kind: "permission", label: "other worktree" }],
      ["/a\n.doan/canvases/checkout.html", { kind: "permission", label: "other group" }],
      ["/a\n.doan/ds/gone.html", { kind: "permission", label: "unlisted" }],
    ]);
    expect(groupSlot(slots, "/a", group("ds", DS))).toBeUndefined();
  });
  test("an empty closed group carries nothing", () => {
    expect(groupSlot(new Map([["/a\n.doan/ds/button.html", { kind: "permission", label: "p" }]]), "/a", group("ds", []))).toBeUndefined();
  });
});

test("on the project row a conversation slot beats a canvas notice; among notices the first listed wins", () => {
  const first = { kind: "canvas" as const, label: "first" }, second = { kind: "canvas" as const, label: "second" };
  const notices = new Map<string, Slot>([["/a\n.doan/canvases/x.html", first], ["/a\n.doan/canvases/y.html", second]]);
  expect(projectSlot(notices, ["/a"], [])).toBe(first);
  expect(projectSlot(notices, ["/a"], ["/a\n.doan/canvases/x.html"])).toBe(second);
  const unseen = { kind: "unseen" as const, label: "u" };
  expect(projectSlot(new Map<string, Slot>([...notices, ["/a\n.doan/canvases/z.html", unseen]]), ["/a"], [])).toBe(unseen);
});

// An empty group's line is a dashed box under its head; the project-level line (info.chip) stays plain text.
test("an empty group's line is a dashed box", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toMatch(/\.shell-group \.shell-empty \{[^}]*border: 1px dashed var\(--border-standard\);[^}]*border-radius: var\(--radius-chip\);/);
  expect(css).not.toMatch(/(^|\n)\.shell-empty[^{]*\{[^}]*dashed/);
  // The box grows by its own vertical padding (8 -> 12px); margins and side padding stay.
  expect(css).toMatch(/\.shell-group \.shell-empty \{[^}]*margin: var\(--space-half\) 10px var\(--space-2\) 34px;[^}]*padding: var\(--space-3\);/);
});

// The sidebar column follows the resizable width; its handle is the panel's, laid in the gutter after the sidebar,
// and the handle's bar shows at 70% (both handles).
test("CSS: the sidebar column is the resizable width and its handle sits in the gutter", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toMatch(/\.workspace\.app-shell \{ grid-template-columns: var\(--doan-sidebar-width\) /);
  expect(css).toMatch(/\.home-shell \{[^}]*grid-template-columns: var\(--doan-sidebar-width\) minmax\(0, 1fr\);/);
  expect(css).toContain(":root { --doan-sidebar-width: 220px; }");
  expect(css).toContain(".doan-panel-handle.doan-sidebar-handle { grid-column: 1 / 2; grid-row: 2 / -1; left: 100%; }");
  expect(css).toContain('.doan-panel-handle:is([data-ui-state="hover"], [data-ui-state="drag"], :focus-visible)::after { opacity: 0.7; }');
});

// A canvas row's button and menu.
function canvasMarkup(extra: Record<string, unknown> = {}, slot?: Slot) {
  const slots = slot ? { slots: new Map([[`/repo\n${row.path}`, slot]]) } : {};
  return renderToStaticMarkup(<ShellSidebar cards={[{ key: "common", name: "demo", rows: [entry] }]} projects={{ common: { roots: ["/repo"], expanded: true } }} loaded={null} canvas={undefined} homeDirectory={null}
    search={vi.fn()} toggle={vi.fn()} disclose={vi.fn()} toggleGroup={vi.fn()} worktree={vi.fn()} open={vi.fn()} overview={vi.fn()} action={vi.fn()} remove={async () => {}} projectSettings={vi.fn()} canvasMenu={NO_CANVAS_MENU} {...slots} {...extra} />);
}
it("gives a canvas row, in a subdirectory too, the project row's menu button after its status spot", () => {
  const html = canvasMarkup({}, { kind: "working", label: "Codex is working" });
  const canvasRow = html.slice(html.indexOf('class="shell-canvas-row row"'));
  expect(canvasRow).toMatch(/^class="shell-canvas-row row"[^>]*aria-label="canvas"/);
  expect(canvasRow.indexOf('<span class="row-slot working" role="img" aria-label="Codex is working">')).toBeGreaterThan(0);
  expect(canvasRow.indexOf('<span class="row-slot working"')).toBeLessThan(canvasRow.indexOf('aria-label="canvas menu"'));
  expect(canvasRow).toMatch(/<button class="doan-icon-button shell-more" aria-label="canvas menu" tabindex="-1"[^>]*>/);
});
it("marks a locked canvas row's button aria-disabled, never the project row's", () => {
  const html = canvasMarkup({ locked: true });
  expect(html).toMatch(/aria-label="canvas menu"[^>]* aria-disabled="true"/);
  expect(html).not.toMatch(/aria-label="demo menu" aria-disabled/);
  expect(html).not.toMatch(/aria-label="canvas menu"[^>]* disabled=""/);
});

// The ownedFocus recovery's new branches: a removed canvas row's focus stays in its group.
it("hands a removed canvas row's focus to the next row of its group, else the previous one, else the group head", () => {
  const project = { key: "p" }, ds = { key: "p\n#ds", parent: "p" }, canvases = { key: "p\n#canvases", parent: "p" };
  const canvas = (key: string, parent: string) => ({ key, parent, canvas: true });
  const a = canvas("p\na", ds.key), b = canvas("p\nb", ds.key), c = canvas("p\nc", ds.key), d = canvas("p\nd", canvases.key);
  const previous = [project, ds, a, b, c, canvases, d];
  const without = (...lost: { key: string }[]) => previous.filter(row => !lost.includes(row));
  expect(recoveryKey(previous, without(b), b.key)).toBe(c.key);
  // The last row of its group goes up, not into the next group.
  expect(recoveryKey(previous, without(c), c.key)).toBe(b.key);
  expect(recoveryKey(previous, without(b, c), c.key)).toBe(a.key);
  // A group left empty keeps its head.
  expect(recoveryKey(previous, without(d), d.key)).toBe(canvases.key);
  expect(recoveryKey(previous, without(a, b, c), b.key)).toBe(ds.key);
  // Any other row keeps the earlier rule, the row now at its place: a project row, and a group head.
  const other = { key: "q" };
  expect(recoveryKey([project, other, ds], [project, ds], other.key)).toBe(ds.key);
  expect(recoveryKey([project, other], [project], other.key)).toBe(project.key);
  expect(recoveryKey(previous, [project, a, b, c, canvases, d], ds.key)).toBe(a.key);
});

it("judges an open canvas menu by its own row, so the project menu's rule never closes it", () => {
  const cards = [{ key: "common", name: "demo", rows: [entry] }];
  const rows = [{ key: "common" }, { key: `/repo\n${row.path}`, parent: "/repo\n#canvases" }];
  expect(staleMenu(null, cards, null, rows, false)).toBe(false);
  // The project rule: no card has this key, so it would close the menu at once.
  expect(staleMenu({ kind: "project", key: `/repo\n${row.path}` }, cards, "/repo", rows, false)).toBe(true);
  expect(staleMenu({ kind: "canvas", key: `/repo\n${row.path}` }, cards, null, rows, false)).toBe(false);
  expect(staleMenu({ kind: "canvas", key: `/repo\n${row.path}` }, cards, null, rows.slice(0, 1), false)).toBe(true);
  // A lock closes it (POSTMORTEM 2026-11-01: a disabled trigger closes its own popup state).
  expect(staleMenu({ kind: "canvas", key: `/repo\n${row.path}` }, cards, null, rows, true)).toBe(true);
  expect(staleMenu({ kind: "project", key: "common" }, cards, "/repo", rows, true)).toBe(false);
  expect(staleMenu({ kind: "project", key: "common" }, cards, "/gone", rows, false)).toBe(true);
});

it("shows a canvas row's button only under the pointer, with keyboard focus in the row or an open menu, in place of the status spot", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  // Hidden visually only: a display: none or visibility: hidden button cannot take the focus Radix or App returns when its menu or
  // dialog closes. A click focuses the row (a treeitem), so only focus-visible focus may show it.
  const idle = css.match(/\.shell-canvas-row:not\(:hover, :focus-visible, :has\(:focus-visible\)\):not\(:has\(> \.shell-more\[aria-expanded="true"\]\)\) > \.shell-more \{([^}]*)\}/)![1]!;
  expect(idle).toContain("position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%);");
  expect(idle).not.toMatch(/display|visibility/);
  for (const rule of css.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^}]*\.shell-more[^{]*\{[^}]*\}/g) ?? []) expect(rule).not.toMatch(/display: none|visibility: hidden/);
  expect(css).toContain('.shell-side .shell-canvas-row:is(:hover, :focus-visible, :has(:focus-visible), :has(> .shell-more[aria-expanded="true"])) { padding-right: 0; }');
  expect(css).toContain('.shell-canvas-row:is(:hover, :focus-visible, :has(:focus-visible), :has(> .shell-more[aria-expanded="true"])) > .row-slot {');
  expect(css).not.toMatch(/\.shell-canvas-row:[^{]*focus-within/);
  // Hidden visually only: never display: none or visibility: hidden, which would drop the spot's name.
  const spot = css.match(/\.shell-canvas-row:is\([^{]*\) > \.row-slot \{([^}]*)\}/)![1]!;
  expect(spot).toContain("clip-path: inset(50%)");
  expect(spot).not.toMatch(/display|visibility/);
  // POSTMORTEM 2026-10-27 (border-box height): a 32px border-box button in a 32px row with no vertical padding.
  expect(css).toContain("* { box-sizing: border-box;");
  expect(css).toContain(".shell-side .row { display: flex; align-items: center; gap: 8px; height: 32px; min-height: 32px; padding: 0 8px;");
  expect(css).toContain(".shell-more.doan-icon-button { width: 32px; height: 32px; flex: none;");
  // The canvas menu is not a project menu: it keeps the opaque sidebar fill.
  expect(css).toContain(".shell-canvas-menu { width: 204px;");
});

// A locked canvas button has the disabled ink and no hover or pressed fill. The shared button's hover rule weighs (0,4,0) and its
// pressed rule (0,5,0), so the reset must weigh more.
it("gives a locked canvas row button no hover or pressed fill, outweighing the shared button rules", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  const controls = readFileSync(new URL("./ds/controls.css", import.meta.url), "utf8");
  expect(css).toContain('.shell-more[aria-disabled="true"] { color: var(--text-disabled); cursor: default; }');
  const reset = '.shell-side .shell-canvas-row.row > .shell-more.doan-icon-button[aria-disabled="true"]:is(:hover, :active)';
  expect(css).toContain(`${reset} { background: transparent; }`);
  // Class, attribute and pseudo-class weight, counting :is()/:not() by their heaviest argument.
  const weight = (selector: string): number => {
    let rest = selector, total = 0;
    for (;;) {
      const match = rest.match(/:(is|not)\(/);
      if (!match) break;
      const start = match.index!, open = start + match[0].length;
      let depth = 1, end = open;
      while (depth) { const ch = rest[end++]; if (ch === "(") depth++; else if (ch === ")") depth--; }
      const args = rest.slice(open, end - 1).split(/,(?![^(]*\))/);
      total += Math.max(...args.map(weight));
      rest = rest.slice(0, start) + rest.slice(end);
    }
    return total + (rest.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) ?? []).length;
  };
  const shared = controls.split("\n").filter(line => line.includes(":is(.doan-button, .doan-icon-button):not(") && /:hover|:active/.test(line)).map(line => line.trim().split(" {")[0]!);
  expect(shared.length).toBeGreaterThanOrEqual(2);
  for (const selector of shared) expect(weight(reset)).toBeGreaterThan(weight(selector));
});

test("a scheduled conversation's slot is the clock with its label", () => {
  const canvas = { path: ".doan/canvases/a.html", url: "u" };
  const entries: FolderEntry[] = [{ path: "/a", kind: "list", servedRev: 0, canvases: [canvas] }];
  const props = { cards: [{ key: "a", name: "alpha", rows: [entries[0]!] }], projects: { a: { roots: ["/a"], expanded: true } }, loaded: "/a", canvas: canvas.path, homeDirectory: null, search: () => {}, toggle: () => {}, disclose: () => {}, toggleGroup: () => {}, worktree: () => {}, open: () => {}, overview: () => {}, action: () => {}, remove: async () => {}, projectSettings: () => {}, canvasMenu: NO_CANVAS_MENU };
  const label = "Queued — sends when the limit resets at 3:00\u202fPM";
  const out = renderToStaticMarkup(<ShellSidebar {...props} home slots={new Map([["/a\n.doan/canvases/a.html", { kind: "scheduled" as const, label }]])} />);
  expect(out).toMatch(new RegExp(`<span data-state="closed" data-slot="tooltip-trigger">a</span><span class="row-slot scheduled" role="img" aria-label="${label}"><svg[^>]*lucide-clock`));
});

// The viewed canvas's conversations under its row.
describe("the viewed canvas's conversation list", () => {
  const A = { path: ".doan/canvases/checkout.html", id: "checkout", url: "u-a" }, B = { path: ".doan/canvases/billing.html", id: "billing", url: "u-b" };
  const listedEntry: FolderEntry = { path: "/w", kind: "list", servedRev: 0, canvases: [A, B] };
  const NOW = Date.parse("2026-11-14T12:00:00.000Z");
  const conversation = (conversationId: string, patch: Record<string, unknown> = {}) => ({ conversationId, canvas: { path: A.path, id: "checkout" }, title: `Title ${conversationId}`, owner: "doan" as const, provider: "claude" as const,
    fromHome: false, phase: "ended" as const, unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-14T11:00:00.000Z", preview: "", ...patch });
  type Options = { list?: unknown; shown?: string | null; folded?: boolean; canvas?: string; home?: boolean; locked?: boolean; slots?: Map<string, Slot>; bare?: Map<string, Slot>; closed?: { ds?: false; canvases?: false } };
  function markup({ list = [conversation("c1", { lastActivityAt: "2026-11-14T11:59:00.000Z" }), conversation("c2", { phase: "running", working: true })], shown = "c1", folded = false, canvas = A.path, home = false, locked = false, slots, bare = new Map(), closed }: Options = {}) {
    return renderToStaticMarkup(<TooltipProvider><ShellSidebar cards={[{ key: "w", name: "demo", rows: [listedEntry] }]} projects={{ w: { roots: ["/w"], selectedRoot: "/w", expanded: true, ...(closed ? { groups: closed } : {}) } }} loaded="/w" canvas={canvas} home={home} locked={locked}
      homeDirectory={null} search={vi.fn()} toggle={vi.fn()} disclose={vi.fn()} toggleGroup={vi.fn()} worktree={vi.fn()} open={vi.fn()} overview={vi.fn()} action={vi.fn()} remove={async () => {}} projectSettings={vi.fn()} canvasMenu={NO_CANVAS_MENU}
      {...(slots ? { slots } : {})}
      conversations={{ list: () => list as never, shown, seen: new Set(), now: NOW, folded, bare, fold: vi.fn(), open: vi.fn(), remove: vi.fn() }} /></TooltipProvider>);
  }
  const rowOf = (html: string, title: string) => html.match(new RegExp(`<div class="shell-conv-row row"[^>]*aria-label="${title}"[^>]*>[\\s\\S]*?</div>`))?.[0] ?? "";

  test("two conversations show under the viewed canvas row as level-4 tree items in a group, the shown one current with a check", () => {
    const html = markup();
    expect(html).toContain('<div role="group" class="shell-conv-list" aria-label="Conversations">');
    // The list is the canvas row's sibling, not inside it, so the row's own focus rules and press never reach it.
    expect(html.indexOf('class="shell-conv-list"')).toBeGreaterThan(html.indexOf('aria-label="checkout menu"'));
    const current = rowOf(html, "Title c1");
    expect(current).toMatch(/role="treeitem"/);
    expect(current).toMatch(/aria-level="4"/);
    expect(current).toMatch(/aria-current="true"/);
    expect(current).toContain('<span class="shell-conv-check" aria-hidden="true">');
    expect(current).toContain('<span class="shell-conv-title" data-state="closed" data-slot="tooltip-trigger">Title c1</span>');
    const other = rowOf(html, "Title c2");
    expect(other).not.toMatch(/aria-current/);
    expect(other).not.toContain("shell-conv-check");
    // Latest activity first.
    expect(html.indexOf('aria-label="Title c1"')).toBeLessThan(html.indexOf('aria-label="Title c2"'));
  });

  test("each row's state is its described status, read even while Delete covers the mark; both are always mounted", () => {
    const row = rowOf(markup(), "Title c2");
    const described = row.match(/aria-describedby="([^"]+)"/)![1]!;
    expect(row).toContain(`<span class="sr-only" id="${described}">Claude Code is working</span>`);
    expect(row).toMatch(/<span class="row-slot working" aria-hidden="true">/);
    expect(row).toMatch(/<button type="button" class="doan-icon-button shell-more conv-trash"[^>]*aria-label="Delete “Title c2”"/);
  });

  test("an unavailable Delete stays reachable with aria-disabled and reads its reason; an available one has neither", () => {
    const html = markup();
    const busy = rowOf(html, "Title c2");
    const reasonId = busy.match(/conv-trash"[^>]*aria-describedby="([^"]+)"/)![1]!;
    expect(busy).toMatch(/conv-trash"[^>]*aria-disabled="true"/);
    expect(busy).toContain(`id="${reasonId}">The agent is working on this conversation.</span>`);
    const idle = rowOf(html, "Title c1");
    expect(idle).not.toMatch(/conv-trash"[^>]*aria-disabled/);
  });

  test("an empty title reads as Conversation, and its Delete as this conversation", () => {
    const html = markup({ list: [conversation("c1", { title: "" }), conversation("c2")] });
    expect(rowOf(html, "Conversation")).toContain('aria-label="Delete this conversation"');
  });

  test("the viewed canvas row with a list carries the chevron in its icon's place and aria-expanded", () => {
    const html = markup();
    const row = html.match(/<div class="shell-canvas-row row"[^>]*aria-label="checkout"[^>]*>/)![0];
    expect(row).toContain('aria-expanded="true"');
    expect(html).toMatch(/<span class="shell-lead canvas-lead"><svg[^>]*class="[^"]*canvas-icon[^"]*"[\s\S]*?<button type="button" class="shell-disclosure" aria-label="Collapse checkout" tabindex="-1">/);
    const folded = markup({ folded: true });
    expect(folded).toMatch(/aria-label="checkout"[^>]*aria-expanded="false"|aria-expanded="false"[^>]*aria-label="checkout"/);
    expect(folded).toContain('aria-label="Expand checkout"');
    expect(folded).not.toContain("shell-conv-list");
  });

  test("one conversation, another canvas row, Home and a list that cannot be read show no list and no chevron", () => {
    for (const html of [markup({ list: [conversation("c1")] }), markup({ list: "error" }), markup({ list: "loading" }), markup({ home: true })]) {
      expect(html).not.toContain("shell-conv-list");
      expect(html).not.toContain("canvas-lead");
      expect(html).not.toMatch(/class="shell-canvas-row row"[^>]*aria-expanded/);
    }
    const other = markup({ canvas: B.path });
    expect(other).not.toContain("shell-conv-list");
  });

  test("while the list shows the canvas row drops its conversation signal and keeps a terminal spinner; folded it shows the strongest", () => {
    const key = `/w\n${A.path}`;
    const slots = new Map<string, Slot>([[key, { kind: "permission", label: "Claude Code needs your answer" }]]);
    const canvasRow = (html: string) => html.match(/<div class="shell-canvas-row row"[^>]*aria-label="checkout"[\s\S]*?checkout menu/)![0];
    expect(canvasRow(markup({ slots }))).not.toContain("row-slot");
    const terminal = new Map<string, Slot>([[key, { kind: "working", label: "Codex is working in a terminal", source: "terminal" }]]);
    expect(canvasRow(markup({ slots, bare: terminal }))).toContain('aria-label="Codex is working in a terminal"');
    expect(canvasRow(markup({ slots, folded: true }))).toContain('aria-label="Claude Code needs your answer"');
  });

  // The viewed canvas stays shown while its group is closed: its row and list hide, so the head carries the canvas's full
  // slot, the conversation signal the list's rows would carry included.
  test("closing the viewed canvas's group hides its row and list, and its head carries the full slot", () => {
    const key = `/w\n${A.path}`;
    const slots = new Map<string, Slot>([[key, { kind: "permission", label: "Claude Code needs your answer" }]]);
    const html = markup({ slots, closed: { canvases: false } });
    expect(html).not.toContain("shell-conv-list");
    expect(html).not.toContain('aria-label="checkout"');
    const head = html.match(/<div class="shell-group-head row"[^>]*aria-label="Canvases"[^>]*>.*?<\/div>/)![0];
    expect(head).toContain('<span class="row-slot permission" role="img" aria-label="Claude Code needs your answer">');
    expect(html.match(/row-slot permission/g)).toHaveLength(1);
  });

  test("the panel's new conversation state marks no row current", () => {
    expect(markup({ shown: null })).not.toMatch(/shell-conv-row[^>]*aria-current/);
  });

  test("a locked page keeps the rows and Delete in the focus order, unavailable", () => {
    const html = markup({ locked: true });
    expect(rowOf(html, "Title c1")).toMatch(/aria-disabled="true"/);
    expect(rowOf(html, "Title c1")).toMatch(/conv-trash"[^>]*aria-disabled="true"/);
  });
});

it("hands a removed conversation row's focus to the next row, else the previous one, else its canvas row", () => {
  const canvasRow = { key: "/w\nc", parent: "/w\n#canvases", canvas: true };
  const conversation = (id: string) => ({ key: `/w\nc\n${id}`, parent: canvasRow.key, conversation: true });
  const a = conversation("a"), b = conversation("b"), c = conversation("c");
  const next = { key: "/w\nd", parent: "/w\n#canvases", canvas: true };
  const previous = [{ key: "w" }, { key: "/w\n#canvases", parent: "w" }, canvasRow, a, b, c, next];
  const without = (...lost: { key: string }[]) => previous.filter(row => !lost.includes(row));
  expect(recoveryKey(previous, without(b), b.key)).toBe(c.key);
  expect(recoveryKey(previous, without(c), c.key)).toBe(b.key);
  // Folding, or a canvas left with one conversation: the list goes and focus goes to its canvas row, not to the
  // canvas row that now sits in the list's place.
  expect(recoveryKey(previous, without(a, b, c), b.key)).toBe(canvasRow.key);
  expect(recoveryKey(previous, without(a, b, c), a.key)).toBe(canvasRow.key);
});

it("CSS: the conversation list's chevron, Delete and status follow the canvas row's reveal rules, hidden visually only", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  // POSTMORTEM 2026-11-06: a reveal-on-focus rule uses :focus-visible, never :focus-within.
  expect(css).toContain(".shell-canvas-row[aria-expanded]:is(:hover, :focus-visible, :has(:focus-visible)) .shell-disclosure { visibility: visible; }");
  expect(css).toContain(".shell-canvas-row[aria-expanded]:is(:hover, :focus-visible, :has(:focus-visible)) .canvas-lead > .canvas-icon { visibility: hidden; }");
  expect(css).toContain('.shell-canvas-row[aria-expanded="false"] .shell-disclosure svg { transform: rotate(-90deg); }');
  expect(css).not.toMatch(/\.shell-conv-row[^{]*focus-within/);
  // POSTMORTEM 2026-11-03: a control that takes focus is hidden visually only.
  const idle = css.match(/\.shell-conv-row:not\(:hover, :focus-visible, :has\(:focus-visible\)\) > \.shell-more \{([^}]*)\}/)![1]!;
  expect(idle).toContain("position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%);");
  expect(idle).not.toMatch(/display|visibility/);
  const spot = css.match(/\.shell-conv-row:is\(:hover, :focus-visible, :has\(:focus-visible\)\) > \.row-slot \{([^}]*)\}/)![1]!;
  expect(spot).toContain("clip-path: inset(50%)");
  expect(spot).not.toMatch(/display|visibility/);
  // The indent: the title starts under the canvas name (10 + 16 + 8 + 16 + 8 = 58 px), the check in the gutter.
  expect(css).toContain(".shell-side .shell-conv-row { position: relative; padding-left: calc(10px + 2 * (var(--size-icon) + var(--space-2)));");
  expect(css).toContain(".shell-conv-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }");
  // The shown conversation's row takes the pressed fill under the pointer, the others the hover fill.
  expect(css).toContain('.shell-side .shell-conv-row[aria-current="true"]:hover { background: var(--affordance-backdrop-pressed); }');
});

// DESIGN 'Motion': under reduced motion every movement goes. The sidebar chevrons point the new way at once, as the
// thread's activity chevron does.
it("stops the sidebar chevrons turning under reduced motion", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^@]*\.shell-disclosure svg, \.shell-group-head svg \{ transition: none; \}/);
});
