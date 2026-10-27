import { describe, expect, test } from "vitest";
import type { FolderEntry } from "../main/view";
import { arrivalAction, INVALID_SUBJECT, newCanvasText, promptCopyLabel, sentenceParts, subjectView, waitEvent } from "./firstPromptView";

describe("subjectView", () => {
  test("a plain subject can be copied and shows no message", () => {
    expect(subjectView("a sign-in screen with SSO")).toEqual({ copyable: true });
    expect(subjectView("  padded  ")).toEqual({ copyable: true });
  });
  test("an empty or blank subject disables Copy without a message", () => {
    expect(subjectView("")).toEqual({ copyable: false });
    expect(subjectView("   ")).toEqual({ copyable: false });
  });
  test("a control character shows the draft message and no count", () => {
    expect(subjectView("a pricing page\twith three tiers")).toEqual({ copyable: false, error: INVALID_SUBJECT });
    expect(INVALID_SUBJECT).toBe("Use one line of plain text, up to 500 characters.");
  });
  test("over 500 characters shows the message and the code-point count of the trimmed text", () => {
    expect(subjectView(` ${"a".repeat(517)} `)).toEqual({ copyable: false, error: INVALID_SUBJECT, count: "517 / 500" });
    expect(subjectView("😀".repeat(500))).toEqual({ copyable: true });
    expect(subjectView("😀".repeat(501)).count).toBe("501 / 500");
  });
});

describe("sentenceParts", () => {
  const root = "/Users/alex/code/billing-api";
  test("without a sentence from main the subject slot shows an ellipsis", () => {
    expect(sentenceParts(root, null)).toEqual({ before: `Use the doan skill to make a design canvas in ${root} for `, mark: "…", after: ".", slot: true });
  });
  test("main's sentence is split so the subject is the marked part", () => {
    expect(sentenceParts(root, `Use the doan skill to make a design canvas in ${root} for a sign-in screen.`))
      .toEqual({ before: `Use the doan skill to make a design canvas in ${root} for `, mark: "a sign-in screen", after: ".", slot: false });
  });
  test("a sentence for another root is shown whole, unmarked", () => {
    const other = "Use the doan skill to make a design canvas in /other for x.";
    expect(sentenceParts(root, other)).toEqual({ before: other, mark: "", after: "", slot: false });
  });
});

describe("promptCopyLabel", () => {
  test("follows the shipped copy labels, and Copy again after an edit of a copied subject", () => {
    expect(promptCopyLabel("idle", false)).toBe("Copy");
    expect(promptCopyLabel("copying", false)).toBe("Copying…");
    expect(promptCopyLabel("copied", false)).toBe("Copied");
    expect(promptCopyLabel("copied", true)).toBe("Copy again");
    expect(promptCopyLabel("failed", false)).toBe("Retry copy");
    expect(promptCopyLabel("failed", true)).toBe("Retry copy");
  });
});

describe("arrivalAction", () => {
  const root = "/code/acme";
  test("the open wizard shows Canvas ready, whatever else is true", () => {
    expect(arrivalAction({ wizardOpen: true, hidden: true, workspaceRoot: root }, root)).toBe("wizard");
  });
  test("a hidden app with the wizard open still shows Canvas ready, not a toast (orch.md decision)", () => {
    expect(arrivalAction({ wizardOpen: true, hidden: true, workspaceRoot: null }, root)).toBe("wizard");
  });
  test("a hidden app shows a toast, even in that workspace", () => {
    expect(arrivalAction({ wizardOpen: false, hidden: true, workspaceRoot: root }, root)).toBe("toast");
  });
  test("in that workspace the canvas opens; on any other screen a toast shows", () => {
    expect(arrivalAction({ wizardOpen: false, hidden: false, workspaceRoot: root }, root)).toBe("open");
    expect(arrivalAction({ wizardOpen: false, hidden: false, workspaceRoot: "/code/other" }, root)).toBe("toast");
    expect(arrivalAction({ wizardOpen: false, hidden: false, workspaceRoot: null }, root)).toBe("toast");
  });
  test("the toast names the project", () => {
    expect(newCanvasText("billing-api")).toBe("New canvas in billing-api");
  });
});

describe("waitEvent", () => {
  const list = (path: string, canvases: string[]): FolderEntry => ({ path, kind: "list", servedRev: 0, canvases: canvases.map(canvas => ({ path: canvas, open: 0, resolved: 0, url: "" })) });
  test("idle never reacts to folder updates", () => {
    expect(waitEvent({ kind: "idle" }, [])).toBeNull();
  });
  test("a waiting root that is listed reports its canvas rows", () => {
    const entries = [list("/other", [".doan/canvases/x.html"]), list("/code/acme", [".doan/canvases/a.html", ".doan/canvases/b.html"])];
    expect(waitEvent({ kind: "waiting", root: "/code/acme", knownPaths: [] }, entries)).toEqual({ type: "listed", root: "/code/acme", rows: (entries[1] as { canvases: unknown }).canvases });
  });
  test("a waiting root that is no longer stored is removed, also after arrival", () => {
    expect(waitEvent({ kind: "waiting", root: "/code/acme", knownPaths: [] }, [list("/other", [])])).toEqual({ type: "removed", root: "/code/acme" });
    expect(waitEvent({ kind: "arrived", root: "/code/acme", path: ".doan/canvases/a.html" }, [])).toEqual({ type: "removed", root: "/code/acme" });
  });
  test("a stored root that is reading or failed keeps waiting; an arrival is not re-listed", () => {
    expect(waitEvent({ kind: "waiting", root: "/code/acme", knownPaths: [] }, [{ path: "/code/acme", kind: "loading" }])).toBeNull();
    expect(waitEvent({ kind: "waiting", root: "/code/acme", knownPaths: [] }, [{ path: "/code/acme", kind: "error", message: "x" }])).toBeNull();
    expect(waitEvent({ kind: "arrived", root: "/code/acme", path: ".doan/canvases/a.html" }, [list("/code/acme", [".doan/canvases/a.html"])])).toBeNull();
  });
});
