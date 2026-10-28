import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ShellSidebar } from "./ShellSidebar";
import type { FolderEntry } from "../main/view";
const row = { path: ".doan/canvases/folder/canvas.html", url: "u", open: 2, resolved: 0, frames: [{ id: "hidden-frame" }] };
const entry: Extract<FolderEntry, { kind: "list" }> = { path: "/repo", kind: "list", servedRev: 0, canvases: [row], git: { common: "/repo/.git", branch: "main", worktrees: [] } };
function render(loaded: string | null, selected = "/repo", expanded = false, problem = false, unlisted = false) {
  const first: FolderEntry = problem ? { ...entry, canvases: [{ ...row, commentsError: { code: "bad", message: "Unreadable" } }] } : entry;
  return renderToStaticMarkup(<ShellSidebar cards={[{ key: "common", name: "demo", rows: [first, { ...entry, path: "/other", canvases: [] }] }]} projects={{ common: { roots: ["/repo", "/other"], selectedRoot: selected, expanded } }} loaded={loaded} unlisted={unlisted} canvas={loaded ? row.path : undefined} homeDirectory={null} search={vi.fn()} toggle={vi.fn()} worktree={vi.fn()} open={vi.fn()} overview={vi.fn()} action={vi.fn()} remove={async () => {}} />);
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
it("preserves the individual comments error instead of showing a zero count", () => {
  const html = render("/repo", "/repo", true, true);
  expect(html).toContain("Couldn’t read this canvas’s comments — run doan check");
  expect(html).toContain('aria-label="Details"');
});

it("describes a positive open-comment count without fabricating counts on read failure", () => {
  expect(render("/repo")).toContain("2 open comments");
  expect(render("/repo", "/repo", true, true)).not.toContain("2 open comments");
  expect(render("/repo", "/repo", true, true)).not.toContain("0 open comments");
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
