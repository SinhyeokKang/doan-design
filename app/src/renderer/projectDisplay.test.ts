import { expect, test } from "vitest";
import type { FolderEntry } from "../main/view";
import { commentContext, displayPath } from "./projectDisplay";

test("home abbreviation respects path boundaries and leaves external paths alone", () => {
  expect(displayPath("/Users/alex/code/app", "/Users/alex")).toBe("~/code/app");
  expect(displayPath("/Users/alex", "/Users/alex")).toBe("~");
  expect(displayPath("/Users/alex-other/app", "/Users/alex")).toBe("/Users/alex-other/app");
  expect(displayPath("/Users/alex/app", null)).toBe("/Users/alex/app");
});
test("draft context identifies the card and branch without the design prefix", () => {
  const entries: FolderEntry[] = [
    { kind: "list", path: "/code/acme", canvases: [], servedRev: 0, git: { common: "/code/acme/.git", main: "/code/acme", branch: "main", worktrees: [] } },
    { kind: "list", path: "/worktrees/billing/acme", canvases: [], servedRev: 0, git: { common: "/code/acme/.git", main: "/code/acme", branch: "feat-billing", worktrees: [] } },
  ];
  expect(commentContext(entries, "/worktrees/billing/acme", ".doan/canvases/checkout.html")).toBe("acme (feat-billing) › checkout.html");
  expect(commentContext([], "/code/brand-kit", ".doan/canvases/tokens.html")).toBe("brand-kit › tokens.html");
});
