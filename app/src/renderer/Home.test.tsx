import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { Home } from "./Home";
import type { FolderEntry } from "../main/view";
import type { ProjectCanvasComments } from "../main/projectComments";
import { TooltipProvider } from "./components/ui/tooltip";

vi.mock("./components/ui/tooltip", async importOriginal => {
  const actual = await importOriginal<typeof import("./components/ui/tooltip")>();
  return { ...actual, TooltipContent: ({ children }: { children: React.ReactNode }) => <span role="tooltip">{children}</span> };
});

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

const counted = (open: number): FolderEntry => ({ kind: "list", path: "/code/main", servedRev: 0, canvases: [{ path: "doan/a.html", id: "a", url: "u", open, resolved: 1 }], git: { common: "/code/main/.git", main: "/code/main", branch: "main", worktrees: [] } });
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

// project-feedback draft `home-summary`: "· N without a canvas" right after
// the review count, plain, and in the row's accessible name.
test("a row adds comments without a canvas after resolved to review", () => {
  const entry = { ...counted(2), orphans: [{ id: "old", file: ".doan/comments/old.jsonl", comments: { open: 3, resolved: 1 }, uncertain: false }] } as FolderEntry;
  const html = render([entry], null, new Map([["/code/main", [{ id: "a", open: 2, resolved: 1, toReview: 1 }]]]));
  expect(html).toMatch(/<span class="wt-sum"><span>1 canvas<\/span> · <span class="hot">2 open<\/span> · <span class="review">1 resolved to review<\/span> · <span>3 without a canvas<\/span> · <span>/);
  expect(html).toContain('aria-label="Project main · 1 canvas · 2 open comments · 1 resolved to review · 3 without a canvas · /code/main"');
});
test("a row with only comments without a canvas starts after the canvas count", () => {
  const entry: FolderEntry = { kind: "list", path: "/code/main", servedRev: 0, canvases: [], orphans: [{ id: "old", file: ".doan/comments/old.jsonl", comments: { open: 2, resolved: 0 }, uncertain: false }], git: { common: "/code/main/.git", main: "/code/main", branch: "main", worktrees: [] } };
  expect(render([entry])).toMatch(/<span class="wt-sum"><span>0 canvases<\/span> · <span>2 without a canvas<\/span> · <span>/);
});
test("a row whose canvas comments could not be read shows no open count", () => {
  const entry: FolderEntry = { ...counted(0), kind: "list", canvases: [{ path: "doan/a.html", id: "a", url: "u", open: 0, resolved: 0, commentsError: { code: "unreadable_comments", message: "m" } }] } as FolderEntry;
  const html = render([entry]);
  expect(html).not.toContain("open");
  expect(html).toContain('aria-label="Project main · 1 canvas · /code/main"');
});

test("names the current selection for the agent in the row and tooltip", () => {
  const selection = { tag: "button", element: { doanId: "pay-button", selector: "button", html: "<button></button>" }, path: [] };
  const html = renderToStaticMarkup(<TooltipProvider><Home homeDirectory={null} entries={[counted(0)]} loaded="/code/main" selection={selection} highlight={[]} enter={() => {}} action={() => {}} remove={() => {}} /></TooltipProvider>);
  expect(html).toContain('Selected for your agent: <b>button · pay-button</b>');
  expect(html).toContain('<span role="tooltip">Selected for your agent: button · pay-button</span>');
});
