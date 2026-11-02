import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, test, vi } from "vitest";
import { projectSlot, ShellSidebar } from "./ShellSidebar";
import type { FolderEntry } from "../main/view";
const row = { path: ".doan/canvases/folder/canvas.html", url: "u", frames: [{ id: "hidden-frame" }] };
const entry: Extract<FolderEntry, { kind: "list" }> = { path: "/repo", kind: "list", servedRev: 0, canvases: [row], git: { common: "/repo/.git", branch: "main", worktrees: [] } };
function render(loaded: string | null, selected = "/repo", expanded = false, problem = false, unlisted = false) {
  const first: FolderEntry = problem ? { ...entry, canvases: [{ ...row, error: { code: "bad", message: "Unreadable" } }] } : entry;
  return renderToStaticMarkup(<ShellSidebar cards={[{ key: "common", name: "demo", rows: [first, { ...entry, path: "/other", canvases: [] }] }]} projects={{ common: { roots: ["/repo", "/other"], selectedRoot: selected, expanded } }} loaded={loaded} unlisted={unlisted} canvas={loaded ? row.path : undefined} homeDirectory={null} search={vi.fn()} toggle={vi.fn()} toggleGroup={vi.fn()} worktree={vi.fn()} open={vi.fn()} overview={vi.fn()} action={vi.fn()} remove={async () => {}} projectSettings={vi.fn()} />);
}
it("renders project to canvas IA, locks current expansion, and keeps the branch passive", () => {
  const html = render("/repo");
  expect(html).toContain('aria-expanded="true"');
  expect(html).toContain('aria-label="canvas"');
  expect(html).toContain('data-key="/repo\n.doan/canvases/folder/canvas.html"');
  expect(html).not.toContain("hidden-frame");
  expect(html).not.toContain('aria-label="Overview"');
  expect(html).toContain('data-ui-variant="translucent"');
  expect(html).not.toContain('aria-label="Switch worktree"');
  expect(html).toContain('aria-label="demo menu"');
});
it("shows only the remembered worktree and keeps other projects collapsed", () => {
  expect(render(null)).not.toContain('aria-label="canvas"');
  expect(render(null, "/other", true)).toContain("No canvases yet");
  expect(render(null, "/other", true)).not.toContain('aria-label="canvas"');
});
it("shows an unreadable canvas's sentence and Details under its row", () => {
  const html = render("/repo", "/repo", true, true);
  expect(html).toContain("Can&#x27;t read this canvas — run doan check");
  expect(html).toContain('aria-label="Details"');
});

// buzz-canvas-conversation: comment counts are no longer part of a canvas row's description.
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

// buzz-home design §3, §6, §7.2: Home shows the sidebar without a current row, the status slot sits at the right of
// a row (before a project's menu), and an added project's row flashes.
test("on Home no row is current; the slot shows a permission hand, a spinner or an unseen Dot with its label", () => {
  const Sidebar = ShellSidebar;
  const canvas = { path: ".doan/canvases/a.html", url: "u" };
  const entries: FolderEntry[] = [{ path: "/a", kind: "list", servedRev: 0, canvases: [canvas] }, { path: "/b", kind: "list", servedRev: 0, canvases: [] }];
  const props = { cards: [{ key: "a", name: "alpha", rows: [entries[0]!] }, { key: "b", name: "beta", rows: [entries[1]!] }], projects: { a: { roots: ["/a"], expanded: true } }, loaded: "/a", canvas: canvas.path, homeDirectory: null, search: () => {}, toggle: () => {}, toggleGroup: () => {}, worktree: () => {}, open: () => {}, overview: () => {}, action: () => {}, remove: async () => {}, projectSettings: () => {} };
  const slots = new Map([["/a\n.doan/canvases/a.html", { kind: "working" as const, label: "Claude Code is working" }], ["/b", { kind: "permission" as const, label: "Codex needs your answer" }]]);
  const home = renderToStaticMarkup(<Sidebar {...props} home slots={slots} highlight={["/b"]} />);
  // Only the Home row is current on Home (dogfooding #2); no project or canvas row is.
  expect(home.replace(/<button type="button" class="shell-home-row row" aria-current="page">/, "")).not.toContain("aria-current");
  expect(home).toContain('<span>a</span><span class="row-slot working" role="img" aria-label="Claude Code is working"><span class="doan-spinner" aria-hidden="true"></span></span>');
  expect(home).toMatch(/class="shell-project-row row flash"[^>]*aria-label="beta"/);
  expect(home).toMatch(/<span class="shell-project-name">beta<\/span><span class="row-slot permission" role="img" aria-label="Codex needs your answer"><svg[^>]*lucide-hand/);
  expect(renderToStaticMarkup(<Sidebar {...props} />)).toContain('aria-current="location"');
  const unseen = renderToStaticMarkup(<Sidebar {...props} slots={new Map([["/b", { kind: "unseen" as const, label: "New changes from Codex" }]])} />);
  expect(unseen).toContain('<span class="row-slot unseen" role="img" aria-label="New changes from Codex"><i></i></span>');
});

test("a project row carries a bound canvas's slot only while that canvas row is not shown, the highest state first", () => {
  const slots = new Map([["/a\n.doan/canvases/x.html", { kind: "unseen" as const, label: "u" }], ["/a", { kind: "working" as const, label: "w" }], ["/b", { kind: "permission" as const, label: "p" }]]);
  expect(projectSlot(slots, ["/a"], [])).toEqual({ kind: "working", label: "w" });
  expect(projectSlot(new Map([["/a\n.doan/canvases/x.html", { kind: "permission" as const, label: "p" }]]), ["/a"], [])).toEqual({ kind: "permission", label: "p" });
  expect(projectSlot(new Map([["/a\n.doan/canvases/x.html", { kind: "permission" as const, label: "p" }]]), ["/a"], ["/a\n.doan/canvases/x.html"])).toBeUndefined();
});

// design-system-canvases design 'sidebar' (Q6–Q8): two groups under an expanded, listed project.
function groups(canvases: string[], closed?: { ds?: false; canvases?: false }, extra: { slots?: Map<string, { kind: "permission" | "working" | "unseen"; label: string }>; entry?: FolderEntry } = {}) {
  const listed: FolderEntry = extra.entry ?? { path: "/a", kind: "list", servedRev: 0, canvases: canvases.map(name => ({ path: `.doan/${name}.html`, url: name })) };
  return renderToStaticMarkup(<ShellSidebar cards={[{ key: "common", name: "demo", rows: [listed] }]} projects={{ common: { roots: ["/a"], expanded: true, ...(closed ? { groups: closed } : {}) } }} loaded={null} canvas={undefined} homeDirectory={null} {...(extra.slots ? { slots: extra.slots } : {})}
    search={vi.fn()} toggle={vi.fn()} toggleGroup={vi.fn()} worktree={vi.fn()} open={vi.fn()} overview={vi.fn()} action={vi.fn()} remove={async () => {}} projectSettings={vi.fn()} />);
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

test("a project whose canvases could not be listed keeps its single status line and no groups", () => {
  const html = groups([], undefined, { entry: { path: "/a", kind: "uninitialized" } });
  expect(html).not.toContain("shell-group-head");
  expect(html).toContain('<p class="shell-empty">');
});

test("a slot in a closed group shows on the project row; open, it stays on its own row", () => {
  const slots = new Map([["/a\n.doan/ds/button.html", { kind: "permission" as const, label: "Codex needs your answer" }]]);
  const closed = groups(["ds/button", "canvases/checkout"], { ds: false }, { slots });
  expect(closed).toMatch(/<span class="shell-project-name">demo<\/span><span class="row-slot permission"/);
  const open = groups(["ds/button", "canvases/checkout"], undefined, { slots });
  expect(open).not.toMatch(/<span class="shell-project-name">demo<\/span><span class="row-slot/);
  expect(open).toMatch(/<span>button<\/span><span class="row-slot permission"/);
  // A group head never carries a slot.
  for (const head of heads(closed)) expect(head).not.toContain("row-slot");
});

// Dogfooding #2: a Home row above the projects, current on Home.
it("puts a Home row above the projects, current only on Home", () => {
  const html = render("/repo");
  expect(html).toMatch(/<button[^>]*class="shell-home-row row"[^>]*>.*Home<\/span><\/button>.*shell-projects-heading/s);
  expect(html).not.toMatch(/class="shell-home-row row"[^>]*aria-current/);
  const onHome = renderToStaticMarkup(<ShellSidebar cards={[]} projects={{}} loaded={null} canvas={undefined} homeDirectory={null} home search={vi.fn()} toggle={vi.fn()} toggleGroup={vi.fn()} worktree={vi.fn()} open={vi.fn()} overview={vi.fn()} action={vi.fn()} remove={vi.fn()} projectSettings={vi.fn()} goHome={vi.fn()} />);
  expect(onHome).toMatch(/class="shell-home-row row"[^>]*aria-current="page"/);
});

// Dogfooding: the sidebar list scrolled with the classic 15px scrollbar and grey track while the panels use the thin,
// quiet one. Both sidebar views take the shared `.doan-scroll`.
it("scrolls the project list and the Settings categories with the shared thin scrollbar", () => {
  expect(render("/repo")).toContain('<div class="shell-projects doan-scroll">');
  const settings = renderToStaticMarkup(<ShellSidebar cards={[]} projects={{}} loaded={null} canvas={undefined} homeDirectory={null} search={vi.fn()} toggle={vi.fn()} toggleGroup={vi.fn()} worktree={vi.fn()} open={vi.fn()} overview={vi.fn()} action={vi.fn()} remove={vi.fn()} projectSettings={vi.fn()} settings={{ section: "agents", select: vi.fn() }} />);
  expect(settings).toContain('<div class="shell-projects doan-scroll">');
});
