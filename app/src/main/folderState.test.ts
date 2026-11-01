import { describe, expect, test } from "vitest";
import { folderState, initOutcome, reconcileFolders, type CliRun } from "./folderState";

const canvases = [{ path: ".doan/canvases/a.html", id: "a", frames: [], comments: { open: 1, resolved: 0 } }];
const listResult = { root: "/repo", scope: [".doan/canvases", "tokens.css"], canvases };

function run(overrides: Partial<CliRun>): CliRun {
  return { exitCode: 0, stdout: "", stderr: "", timedOut: false, ...overrides };
}

function envelope(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

function failure(code: string, message: string): string {
  return envelope({ v: 1, ok: false, error: { code, message, nextSteps: [] } });
}

describe("folderState", () => {
  test("lists canvases from a success envelope", () => {
    const state = folderState(run({ stdout: envelope({ v: 1, ok: true, result: listResult }) }));
    expect(state).toEqual({ kind: "list", root: "/repo", scope: [".doan/canvases", "tokens.css"], canvases });
  });

  test("keeps canvases in CLI order", () => {
    const ordered = [{ path: ".doan/canvases/foo.html" }, { path: ".doan/canvases/foo-bar.html" }];
    const state = folderState(run({ stdout: envelope({ v: 1, ok: true, result: { root: "/repo", scope: [], canvases: ordered } }) }));
    expect(state).toEqual({ kind: "list", root: "/repo", scope: [], canvases: ordered });
  });

  test("repo_not_found means the folder is not initialized", () => {
    const state = folderState(run({ exitCode: 2, stdout: failure("repo_not_found", "No .doan/config.json") }));
    expect(state).toEqual({ kind: "uninitialized" });
  });

  test("other failure envelopes show their message", () => {
    expect(folderState(run({ exitCode: 2, stdout: failure("invalid_config", "config is broken") })))
      .toEqual({ kind: "error", message: "config is broken" });
    expect(folderState(run({ exitCode: 2, stdout: failure("unsupported_version", "v 9 is not supported") })))
      .toEqual({ kind: "error", message: "v 9 is not supported" });
    expect(folderState(run({ exitCode: 1, stdout: failure("internal_error", "boom") })))
      .toEqual({ kind: "error", message: "boom" });
  });

  test("an envelope that fails validation is a CLI error", () => {
    const stdout = envelope({ v: 1, ok: false, error: { code: "repo_not_found", message: "x" } });
    expect(folderState(run({ exitCode: 2, stdout, stderr: "warn\n" }))).toEqual({ kind: "cliError", reason: "warn" });
  });

  test("an envelope with v 2 is a CLI error", () => {
    const stdout = envelope({ v: 2, ok: true, result: listResult });
    expect(folderState(run({ stdout }))).toEqual({ kind: "cliError", reason: "" });
  });

  test("ok false with exit code 0 is a CLI error", () => {
    expect(folderState(run({ exitCode: 0, stdout: failure("repo_not_found", "x") }))).toEqual({ kind: "cliError", reason: "" });
  });

  test("ok true with a non-zero exit code is a CLI error", () => {
    const stdout = envelope({ v: 1, ok: true, result: listResult });
    expect(folderState(run({ exitCode: 1, stdout }))).toEqual({ kind: "cliError", reason: "" });
  });

  test("a result without root or scope (older doan) is a CLI error", () => {
    const withoutBoth = envelope({ v: 1, ok: true, result: { canvases } });
    const withoutRoot = envelope({ v: 1, ok: true, result: { scope: [], canvases } });
    const withoutScope = envelope({ v: 1, ok: true, result: { root: "/repo", canvases } });
    for (const stdout of [withoutBoth, withoutRoot, withoutScope]) {
      expect(folderState(run({ stdout }))).toEqual({ kind: "cliError", reason: "" });
    }
  });

  test("a result with the wrong field types is a CLI error", () => {
    const results = [
      null,
      [],
      "text",
      { root: 1, scope: [], canvases },
      { root: "/repo", scope: ".doan/canvases", canvases },
      { root: "/repo", scope: [".doan/canvases", 1], canvases },
      { root: "/repo", scope: [] },
      { root: "/repo", scope: [], canvases: {} },
    ];
    for (const result of results) {
      expect(folderState(run({ stdout: envelope({ v: 1, ok: true, result }) }))).toEqual({ kind: "cliError", reason: "" });
    }
  });

  test("an exit code with empty stdout (no CLI) is a CLI error with the first stderr line", () => {
    const state = folderState(run({ exitCode: 127, stderr: "doan: command not found\nsecond line\n" }));
    expect(state).toEqual({ kind: "cliError", reason: "doan: command not found" });
  });

  test("a spawn failure is a CLI error carrying the spawn error", () => {
    const spawnError = "spawn /nonexistent/doan ENOENT";
    expect(folderState(run({ exitCode: -2, spawnError }))).toEqual({ kind: "cliError", reason: spawnError });
    expect(folderState(run({ exitCode: null, spawnError }))).toEqual({ kind: "cliError", reason: spawnError });
  });

  test("a spawn error wins over stderr and a valid envelope", () => {
    const stdout = envelope({ v: 1, ok: true, result: listResult });
    const state = folderState(run({ stdout, stderr: "other\n", spawnError: "spawn doan EACCES" }));
    expect(state).toEqual({ kind: "cliError", reason: "spawn doan EACCES" });
  });

  test("a missing exit code is a CLI error", () => {
    const stdout = envelope({ v: 1, ok: true, result: listResult });
    expect(folderState(run({ exitCode: null, stdout }))).toEqual({ kind: "cliError", reason: "" });
  });

  test("stdout that is not JSON is a CLI error", () => {
    expect(folderState(run({ stdout: "Usage: doan <command>\n", stderr: "panic: x\r\nmore" })))
      .toEqual({ kind: "cliError", reason: "panic: x" });
    expect(folderState(run({ stdout: `${envelope({ v: 1, ok: true, result: listResult })}{}` })))
      .toEqual({ kind: "cliError", reason: "" });
  });

  // `git` is optional in `doan ls`; a malformed one is dropped, never an error,
  // because the listing itself is still good (design 'git 해석').
  test("passes a well-formed git field through", () => {
    const branch = { common: "/repo/.git", main: "/repo", branch: "main", worktrees: ["/repo", "/wt"] };
    const detached = { common: "/repo/.git", detached: "a".repeat(40), worktrees: ["/wt"] };
    for (const git of [branch, detached]) {
      const state = folderState(run({ stdout: envelope({ v: 1, ok: true, result: { ...listResult, git } }) }));
      expect(state).toEqual({ kind: "list", root: "/repo", scope: [".doan/canvases", "tokens.css"], canvases, git });
    }
  });

  test("drops a malformed git field and keeps the listing", () => {
    const bad = [
      null,
      "x",
      { worktrees: [] },
      { common: 1, worktrees: [] },
      { common: "/c" },
      { common: "/c", worktrees: "/w" },
      { common: "/c", worktrees: ["/w", 1] },
      { common: "/c", worktrees: [], branch: 1 },
      { common: "/c", worktrees: [], main: null },
      { common: "/c", worktrees: [], detached: false },
    ];
    for (const git of bad) {
      const state = folderState(run({ stdout: envelope({ v: 1, ok: true, result: { ...listResult, git } }) }));
      expect(state, JSON.stringify(git)).toEqual({ kind: "list", root: "/repo", scope: [".doan/canvases", "tokens.css"], canvases });
    }
  });

  test("a timeout is a CLI error even with a valid envelope", () => {
    const stdout = envelope({ v: 1, ok: true, result: listResult });
    expect(folderState(run({ exitCode: null, stdout, timedOut: true }))).toEqual({ kind: "cliError", reason: "timed out after 10 s" });
    expect(folderState(run({ stdout, timedOut: true, stderr: "slow\n" }))).toEqual({ kind: "cliError", reason: "timed out after 10 s" });
    expect(folderState(run({ exitCode: null, timedOut: true, spawnError: "spawn doan EACCES" })))
      .toEqual({ kind: "cliError", reason: "spawn doan EACCES" });
  });
});

describe("initOutcome", () => {
  test.each([true, false])("accepts initialized %s without adopting result.repo spelling", (initialized) => {
    expect(initOutcome(run({ stdout: envelope({ v: 1, ok: true, result: { initialized, repo: "/REPO", created: [] } }) }))).toEqual({ kind: "success" });
  });
  test("keeps CLI errors and app guidance, never CLI nextSteps", () => {
    expect(initOutcome(run({ exitCode: 2, stdout: failure("invalid_config", "Broken config") }))).toEqual({ kind: "error", message: "Broken config", guidance: "Fix the project configuration, then try again." });
    expect(initOutcome(run({ exitCode: 2, stdout: failure("usage_error", "Outside repo") }))).toMatchObject({ kind: "error", message: "Outside repo" });
    expect(initOutcome(run({ timedOut: true }))).toMatchObject({ kind: "cliError", reason: "timed out after 10 s" });
    expect(initOutcome(run({ spawnError: "ENOENT" }))).toMatchObject({ kind: "cliError", reason: "ENOENT" });
  });
  test("rejects malformed results and inconsistent exits", () => {
    for (const result of [{}, { initialized: "false" }, { initialized: false, repo: "/r", created: "x" }]) expect(initOutcome(run({ stdout: envelope({ v: 1, ok: true, result }) })).kind).toBe("cliError");
    expect(initOutcome(run({ stdout: failure("invalid_config", "broken") })).kind).toBe("cliError");
    expect(initOutcome(run({ stdout: "garbage" })).kind).toBe("cliError");
    expect(initOutcome(run({ exitCode: 1, stdout: envelope({ v: 1, ok: true, result: { initialized: true, repo: "/r", created: [] } }) })).kind).toBe("cliError");
  });
});

describe("reconcileFolders", () => {
  const upward = (root: string) => ({ kind: "list" as const, root, scope: [], canvases: [] });
  test("replaces at the old position, merges duplicates keeping the earliest position, and returns focus", () => {
    expect(reconcileFolders(["/a", "/repo/web", "/b", "/repo"], "/repo/web", upward("/repo"))).toEqual({ folders: ["/a", "/repo", "/b"], focus: "/repo" });
    expect(reconcileFolders(["/repo", "/a", "/repo/web"], "/repo/web", upward("/repo"))).toEqual({ folders: ["/repo", "/a"], focus: "/repo" });
  });
  test("two subfolders re-root against the latest list without losing neighbors", () => {
    const first = reconcileFolders(["/repo/web", "/x", "/repo/api"], "/repo/web", upward("/repo"));
    expect(reconcileFolders(first.folders, "/repo/api", upward("/repo"))).toEqual({ folders: ["/repo", "/x"], focus: "/repo" });
  });
  test("uses canonical CLI root for case aliases but never lowercases unrelated stored paths", () => {
    expect(reconcileFolders(["/REPO", "/repo", "/Other", "/other"], "/REPO", upward("/repo"))).toEqual({ folders: ["/repo", "/Other", "/other"], focus: "/repo" });
  });
  test("leaves paths unchanged on broken config, CLI failure, absence, and stale completion", () => {
    const stored = ["/repo/web"];
    for (const state of [{ kind: "error", message: "bad config" }, { kind: "cliError", reason: "timeout" }, { kind: "uninitialized" }] as const) expect(reconcileFolders(stored, "/repo/web", state)).toEqual({ folders: stored, focus: "/repo/web" });
    expect(reconcileFolders(["/a"], "/closed", upward("/repo"))).toEqual({ folders: ["/a"], focus: null });
    expect(stored).toEqual(["/repo/web"]);
  });
});

// project-feedback design §1–§2: `doan ls` keeps a row it could not read and
// adds the comment files no canvas uses.
describe("folderState partial failure and orphans", () => {
  const orphan = { id: "checkout-v1", file: ".doan/comments/checkout-v1.jsonl", comments: { open: 2, resolved: 1 }, uncertain: false };

  test("a listing with unreadable rows stays a list and keeps the rows as sent", () => {
    const rows = [
      { path: ".doan/canvases/a.html", id: "a", frames: [], commentsError: { code: "unreadable_comments", message: ".doan/canvases/a.html: .doan/comments/a.jsonl: permission denied" } },
      { path: ".doan/canvases/b.html", frames: [], error: { code: "unreadable_canvas", message: ".doan/canvases/b.html: permission denied" } },
    ];
    const state = folderState(run({ stdout: envelope({ v: 1, ok: true, result: { ...listResult, canvases: rows, orphans: [] } }) }));
    expect(state).toEqual({ kind: "list", root: "/repo", scope: [".doan/canvases", "tokens.css"], canvases: rows, orphans: [] });
  });

  test("passes well-formed orphans through in CLI order", () => {
    const unreadable = { id: "promo", file: ".doan/comments/promo.jsonl", error: { code: "unreadable_comments", message: ".doan/comments/promo.jsonl: permission denied" }, uncertain: true };
    const foreign = { id: "Foo", file: ".doan/comments/Foo.jsonl", comments: { open: 0, resolved: 0 }, uncertain: false };
    const state = folderState(run({ stdout: envelope({ v: 1, ok: true, result: { ...listResult, orphans: [orphan, unreadable, foreign] } }) }));
    expect(state).toEqual({ kind: "list", root: "/repo", scope: [".doan/canvases", "tokens.css"], canvases, orphans: [orphan, unreadable, foreign] });
    const extra = folderState(run({ stdout: envelope({ v: 1, ok: true, result: { ...listResult, orphans: [{ ...orphan, size: 3, comments: { ...orphan.comments, deleted: 1 } }] } }) }));
    expect(extra).toEqual({ kind: "list", root: "/repo", scope: [".doan/canvases", "tokens.css"], canvases, orphans: [orphan] });
  });

  // A file named `.jsonl` has the empty stem as its id; doan check warns about
  // it; the app preserves the CLI entry as it does other orphan IDs.
  test("keeps an orphan whose id is empty", () => {
    const empty = { id: "", file: ".doan/comments/.jsonl", comments: { open: 1, resolved: 0 }, uncertain: false };
    const state = folderState(run({ stdout: envelope({ v: 1, ok: true, result: { ...listResult, orphans: [empty] } }) }));
    expect(state).toEqual({ kind: "list", root: "/repo", scope: [".doan/canvases", "tokens.css"], canvases, orphans: [empty] });
  });

  // Orphan counts support the ID-change notice; malformed entries are dropped rather
  // than failing the listing, and an absent field is no orphans at all.
  test("drops malformed orphan entries and keeps the listing", () => {
    const bad = [
      null,
      "x",
      { ...orphan, id: 1 },
      { ...orphan, file: undefined },
      { ...orphan, uncertain: "no" },
      { id: "x", file: ".doan/comments/x.jsonl", comments: { open: 2, resolved: 1 } },
      { ...orphan, comments: { open: -1, resolved: 0 } },
      { ...orphan, comments: { open: 1.5, resolved: 0 } },
      { ...orphan, comments: { open: 1 } },
      { ...orphan, error: { code: "unreadable_comments" } },
      { ...orphan, error: "boom" },
    ];
    const state = folderState(run({ stdout: envelope({ v: 1, ok: true, result: { ...listResult, orphans: [...bad, orphan] } }) }));
    expect(state).toEqual({ kind: "list", root: "/repo", scope: [".doan/canvases", "tokens.css"], canvases, orphans: [orphan] });
    const notList = folderState(run({ stdout: envelope({ v: 1, ok: true, result: { ...listResult, orphans: { id: "x" } } }) }));
    expect(notList).toEqual({ kind: "list", root: "/repo", scope: [".doan/canvases", "tokens.css"], canvases });
  });
});
