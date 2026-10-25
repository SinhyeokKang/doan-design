import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Home } from "./Home";
import type { FolderEntry } from "../main/view";
import type { ProjectCanvasComments } from "../main/projectComments";
import { TooltipProvider } from "./components/ui/tooltip";

const render = (entries: FolderEntry[], loaded: string | null = null, comments: ReadonlyMap<string, readonly ProjectCanvasComments[]> = new Map()) => renderToStaticMarkup(<TooltipProvider><Home homeDirectory={null} entries={entries} loaded={loaded} selection={null} highlight={[]} comments={comments} enter={() => {}} action={() => {}} remove={() => {}} /></TooltipProvider>);
test("empty home explains how to add a project", () => {
  expect(render([])).toContain("Add a project to see its design canvases.");
});
test("home groups worktrees and exposes the loaded workspace without exposing canvas controls", () => {
  const rows: FolderEntry[] = ["main", "feature"].map(branch => ({ kind: "list", path: `/code/${branch}`, servedRev: 0, canvases: [], git: { common: "/code/main/.git", main: "/code/main", branch, worktrees: [] } }));
  const html = render(rows, "/code/main");
  expect(html.match(/class="card"/g)).toHaveLength(1);
  expect(html).toContain('aria-current="true"');
  expect(html).toContain("Open</span>");
  expect(html).not.toContain("Zoom");
});
test("problem rows use the action table and do not leak CLI error reasons", () => {
  const html = render([{ kind: "cliError", path: "/code/failed", reason: "private failure" }, { kind: "notFound", path: "/code/missing" }]);
  expect(html).toContain("Retry");
  expect(html).toContain("Locate…");
  expect(html).toContain("Remove");
  expect(html).not.toContain("private failure");
});

const counted = (open: number): FolderEntry => ({ kind: "list", path: "/code/main", servedRev: 0, canvases: [{ path: "design/a.html", id: "a", url: "u", open, resolved: 1 }], git: { common: "/code/main/.git", main: "/code/main", branch: "main", worktrees: [] } });
test("a row shows open, then resolved to review, from the project read", () => {
  const html = render([counted(2)], null, new Map([["/code/main", [{ id: "a", open: 2, resolved: 1, toReview: 1 }]]]));
  expect(html).toMatch(/<span class="hot">2 open<\/span> · <span class="review">1 resolved to review<\/span> · <span>/);
  expect(html).toContain('aria-label="Project main · 1 canvas · 2 open comments · 1 resolved to review · /code/main"');
});
test("a zero count, a missing read and a failed canvas show no resolved to review", () => {
  for (const comments of [[{ id: "a", open: 1, resolved: 1, toReview: 0 }], undefined, [{ id: "a", error: "EACCES" }]]) {
    const html = render([counted(1)], null, new Map(comments ? [["/code/main", comments]] : []));
    expect(html).not.toContain("resolved to review");
    expect(html).toContain('aria-label="Project main · 1 canvas · 1 open comment · /code/main"');
  }
});
