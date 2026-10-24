import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Home } from "./Home";
import type { FolderEntry } from "../main/view";
import { TooltipProvider } from "./components/ui/tooltip";

const render = (entries: FolderEntry[], loaded: string | null = null) => renderToStaticMarkup(<TooltipProvider><Home homeDirectory={null} entries={entries} loaded={loaded} selection={null} highlight={[]} enter={() => {}} action={() => {}} remove={() => {}} /></TooltipProvider>);
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
