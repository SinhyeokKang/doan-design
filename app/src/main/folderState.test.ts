import { describe, expect, test } from "vitest";
import { mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLI_TIMEOUT_MS, folderState, homeOrAbove, initOutcome, realHome, reconcileFolders, type CliRun } from "./folderState";

// The fixtures Go and TS both validate (schema/fixtures/cli-envelope).
const fixture = (name: string): string => readFileSync(new URL(`../../../schema/fixtures/cli-envelope/${name}`, import.meta.url), "utf8");

const canvases = [{ path: ".doan/canvases/a.html", id: "a", frames: [], comments: { open: 1, resolved: 0 } }];
const listResult = { root: "/repo", scope: [".doan/canvases", "tokens.css"], canvases };

// exit 0 with an answer that cannot be read and nothing on stderr (draft .doan/canvases/fixes-0-1-2.html, frame overlay-cli-error).
const UNREADABLE = "The doan command answered, but Doan couldn’t read the answer.";

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

  // ls says why Keep out of Git would need a new repository (error.storageReason, only on its repo_not_found), so the
  // setup screens can show the .git/ the setup would create before anything is written.
  test("repo_not_found carrying storageReason not_git is a folder outside Git", () => {
    expect(folderState(run({ exitCode: 2, stdout: fixture("valid/repo-not-found-not-git.json") }))).toEqual({ kind: "uninitialized", notGit: true });
    const reason = (code: string) => envelope({ v: 1, ok: false, error: { code, message: "m", nextSteps: [], storageReason: "not_git" } });
    // Only ls's repo_not_found means it; the field on another failure says nothing about setup.
    expect(folderState(run({ exitCode: 1, stdout: reason("internal_error") }))).toEqual({ kind: "cliError", reason: "m", code: "internal_error" });
    // A reason this Doan does not know fails the envelope's schema, as every unknown value does.
    expect(folderState(run({ exitCode: 2, stdout: fixture("invalid/unknown-storage-reason.json") })).kind).toBe("cliError");
  });

  // Only a failure that names a config file is a Config error; the code does not decide it.
  test("a failure envelope naming a config file is a Config error carrying that path", () => {
    const named = (code: string, message: string, config: string) => envelope({ v: 1, ok: false, error: { code, message, nextSteps: [], config } });
    expect(folderState(run({ exitCode: 2, stdout: named("invalid_config", "config is broken", "/repo/.doan/config.json") })))
      .toEqual({ kind: "error", message: "config is broken", config: "/repo/.doan/config.json" });
    expect(folderState(run({ exitCode: 2, stdout: named("unsupported_version", "v 9 is not supported", "/repo/.doan/config.json") })))
      .toEqual({ kind: "error", message: "v 9 is not supported", config: "/repo/.doan/config.json", newer: true });
    // An unreadable config is an internal_error, and still a Config error because the CLI named the file.
    expect(folderState(run({ exitCode: 1, stdout: named("internal_error", "open /repo/.doan/config.json: permission denied", "/repo/.doan/config.json") })))
      .toEqual({ kind: "error", message: "open /repo/.doan/config.json: permission denied", config: "/repo/.doan/config.json" });
  });

  test("the shared fixture of a failure naming its config reads as a Config error", () => {
    const stdout = fixture("valid/invalid-config-with-config.json");
    expect(folderState(run({ exitCode: 2, stdout }))).toEqual({ kind: "error", message: "Cannot read config: /tmp/repo/.doan/config.json", config: "/tmp/repo/.doan/config.json" });
  });

  // Go read the folder but failed for another reason (an unreadable canvas folder): a CLI error showing the CLI's
  // message, with the code main reads to know the CLI answered.
  test("a failure envelope naming no config file is a CLI error with its code", () => {
    expect(folderState(run({ exitCode: 1, stdout: failure("internal_error", "open /repo/.doan/canvases/sub: permission denied") })))
      .toEqual({ kind: "cliError", reason: "open /repo/.doan/canvases/sub: permission denied", code: "internal_error" });
    // invalid_config without the field is not a Config error either.
    expect(folderState(run({ exitCode: 2, stdout: failure("invalid_config", "config is broken") })))
      .toEqual({ kind: "cliError", reason: "config is broken", code: "invalid_config" });
    // An empty message falls back to the usual account of the run.
    expect(folderState(run({ exitCode: 1, stdout: failure("internal_error", "") })))
      .toEqual({ kind: "cliError", reason: "The doan command exited with code 1 without a message.", code: "internal_error" });
  });

  test("a failure envelope with exit code 0 is a CLI error without a code, even naming a config", () => {
    const stdout = envelope({ v: 1, ok: false, error: { code: "invalid_config", message: "bad", nextSteps: [], config: "/repo/.doan/config.json" } });
    expect(folderState(run({ exitCode: 0, stdout }))).toEqual({ kind: "cliError", reason: "bad" });
  });

  test("a failure envelope with a relative config fails validation and is a CLI error without a code", () => {
    const stdout = envelope({ v: 1, ok: false, error: { code: "invalid_config", message: "bad", nextSteps: [], config: ".doan/config.json" } });
    expect(folderState(run({ exitCode: 2, stdout }))).toEqual({ kind: "cliError", reason: "The doan command exited with code 2 without a message." });
  });

  test("an envelope that fails validation is a CLI error", () => {
    const stdout = envelope({ v: 1, ok: false, error: { code: "repo_not_found", message: "x" } });
    expect(folderState(run({ exitCode: 2, stdout, stderr: "warn\n" }))).toEqual({ kind: "cliError", reason: "warn" });
  });

  test("an envelope with v 2 is a CLI error", () => {
    const stdout = envelope({ v: 2, ok: true, result: listResult });
    expect(folderState(run({ stdout }))).toEqual({ kind: "cliError", reason: UNREADABLE });
  });

  test("ok false with exit code 0 is a CLI error carrying the envelope's message", () => {
    expect(folderState(run({ exitCode: 0, stdout: failure("repo_not_found", "x") }))).toEqual({ kind: "cliError", reason: "x" });
  });

  test("ok true with a non-zero exit code is a CLI error", () => {
    const stdout = envelope({ v: 1, ok: true, result: listResult });
    expect(folderState(run({ exitCode: 1, stdout }))).toEqual({ kind: "cliError", reason: "The doan command exited with code 1 without a message." });
  });

  test("a result without root or scope (older doan) is a CLI error", () => {
    const withoutBoth = envelope({ v: 1, ok: true, result: { canvases } });
    const withoutRoot = envelope({ v: 1, ok: true, result: { scope: [], canvases } });
    const withoutScope = envelope({ v: 1, ok: true, result: { root: "/repo", canvases } });
    for (const stdout of [withoutBoth, withoutRoot, withoutScope]) {
      expect(folderState(run({ stdout }))).toEqual({ kind: "cliError", reason: UNREADABLE });
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
      expect(folderState(run({ stdout: envelope({ v: 1, ok: true, result }) }))).toEqual({ kind: "cliError", reason: UNREADABLE });
    }
  });

  test("an exit code with empty stdout (no CLI) is a CLI error with the first stderr line", () => {
    const state = folderState(run({ exitCode: 127, stderr: "doan: command not found\nsecond line\n" }));
    expect(state).toEqual({ kind: "cliError", reason: "doan: command not found" });
  });

  test("a spawn failure is a CLI error carrying the spawn error", () => {
    const spawnError = "spawn /nonexistent/doan ENOENT";
    expect(folderState(run({ exitCode: -2, spawnError }))).toEqual({ kind: "cliError", reason: `Couldn’t start the doan command: ${spawnError}` });
    expect(folderState(run({ exitCode: null, spawnError }))).toEqual({ kind: "cliError", reason: `Couldn’t start the doan command: ${spawnError}` });
  });

  test("a spawn error wins over stderr and a valid envelope", () => {
    const stdout = envelope({ v: 1, ok: true, result: listResult });
    const state = folderState(run({ stdout, stderr: "other\n", spawnError: "spawn doan EACCES" }));
    expect(state).toEqual({ kind: "cliError", reason: "Couldn’t start the doan command: spawn doan EACCES" });
  });

  test("a missing exit code is a CLI error", () => {
    const stdout = envelope({ v: 1, ok: true, result: listResult });
    expect(folderState(run({ exitCode: null, stdout }))).toEqual({ kind: "cliError", reason: "The doan command stopped without a message." });
  });

  test("stdout that is not JSON is a CLI error", () => {
    expect(folderState(run({ stdout: "Usage: doan <command>\n", stderr: "panic: x\r\nmore" })))
      .toEqual({ kind: "cliError", reason: "panic: x" });
    expect(folderState(run({ stdout: `${envelope({ v: 1, ok: true, result: listResult })}{}` })))
      .toEqual({ kind: "cliError", reason: UNREADABLE });
  });

  // `git` is optional in `doan ls`; a malformed one is dropped, never an error,
  // because the listing itself is still good.
  test("passes a well-formed git field through", () => {
    const branch = { common: "/repo/.git", main: "/repo", branch: "main", worktrees: ["/repo", "/wt"] };
    const detached = { common: "/repo/.git", detached: "a".repeat(40), worktrees: ["/wt"] };
    for (const git of [branch, detached]) {
      const state = folderState(run({ stdout: envelope({ v: 1, ok: true, result: { ...listResult, git } }) }));
      expect(state).toEqual({ kind: "list", root: "/repo", scope: [".doan/canvases", "tokens.css"], canvases, git });
    }
  });

  // ARCHITECTURE §12 'Storage': where the Doan files are kept, as ls reports it; anything else is left out, not an
  // error.
  test("passes the storage mode and its reason through, and drops unknown values", () => {
    const listed = (extra: object) => folderState(run({ stdout: envelope({ v: 1, ok: true, result: { ...listResult, ...extra } }) }));
    expect(listed({ storage: "local" })).toEqual({ kind: "list", root: "/repo", scope: [".doan/canvases", "tokens.css"], canvases, storage: "local" });
    expect(listed({ storage: "repo", storageReason: "not_git" })).toMatchObject({ storage: "repo", storageReason: "not_git" });
    expect(listed({ storage: "unknown", storageReason: "git_unreadable" })).toMatchObject({ storage: "unknown", storageReason: "git_unreadable" });
    expect(listed({ storage: "repo", storageReason: "exclude_unwritable" })).toMatchObject({ storage: "repo", storageReason: "exclude_unwritable" });
    expect(listed({ storage: "elsewhere" })).toEqual({ kind: "list", root: "/repo", scope: [".doan/canvases", "tokens.css"], canvases });
    expect(listed({ storage: "local", storageReason: 1 })).toEqual({ kind: "list", root: "/repo", scope: [".doan/canvases", "tokens.css"], canvases, storage: "local" });
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
    expect(folderState(run({ exitCode: null, stdout, timedOut: true }))).toEqual({ kind: "cliError", reason: "The doan command didn’t answer within 10 seconds." });
    expect(folderState(run({ stdout, timedOut: true, stderr: "slow\n" }))).toEqual({ kind: "cliError", reason: "The doan command didn’t answer within 10 seconds." });
    expect(folderState(run({ exitCode: null, timedOut: true, spawnError: "spawn doan EACCES" })))
      .toEqual({ kind: "cliError", reason: "Couldn’t start the doan command: spawn doan EACCES" });
  });

  // The runner's kill and the sentence that reports it come from one constant, so they cannot drift apart.
  test("a timeout's reason names the runner's timeout", () => {
    expect(CLI_TIMEOUT_MS).toBe(10_000);
    expect(folderState(run({ exitCode: null, timedOut: true }))).toEqual({ kind: "cliError", reason: `The doan command didn’t answer within ${CLI_TIMEOUT_MS / 1000} seconds.` });
  });

  // PRODUCT §5 item 3 'Problem states': Details shows this reason, so it is never empty.
  test("a CLI error's reason is never empty: the command's message, else a short account of the run", () => {
    const listed = envelope({ v: 1, ok: true, result: listResult });
    const cases: [Partial<CliRun>, string][] = [
      // An error envelope with no message falls back to the run, then stderr wins over the fallback.
      [{ exitCode: 0, stdout: failure("internal_error", "") }, UNREADABLE],
      [{ exitCode: 0, stdout: failure("internal_error", ""), stderr: "boom\n" }, "boom"],
      [{ exitCode: 0, stdout: failure("internal_error", "  "), stderr: "" }, UNREADABLE],
      [{ exitCode: 0, stdout: "not json" }, UNREADABLE],
      [{ exitCode: 0, stdout: "not json", stderr: "only stderr" }, "only stderr"],
      // The first line that says something, not a blank one before it.
      [{ exitCode: 3, stderr: "\n  \r\nreal line\nnext" }, "real line"],
      [{ exitCode: 3, stderr: "\n\n" }, "The doan command exited with code 3 without a message."],
      [{ exitCode: 3 }, "The doan command exited with code 3 without a message."],
      [{ exitCode: null }, "The doan command stopped without a message."],
      [{ exitCode: null, timedOut: true }, "The doan command didn’t answer within 10 seconds."],
      [{ exitCode: null, spawnError: "" }, "Couldn’t start the doan command."],
      [{ exitCode: 1, stdout: listed }, "The doan command exited with code 1 without a message."],
    ];
    for (const [overrides, reason] of cases) expect(folderState(run(overrides)), JSON.stringify(overrides)).toEqual({ kind: "cliError", reason });
  });
});

describe("initOutcome", () => {
  test.each([true, false])("accepts initialized %s without adopting result.repo spelling", (initialized) => {
    expect(initOutcome(run({ stdout: envelope({ v: 1, ok: true, result: { initialized, repo: "/REPO", created: [] } }) }))).toEqual({ kind: "success" });
  });
  test("keeps CLI errors and app guidance, never CLI nextSteps", () => {
    expect(initOutcome(run({ exitCode: 2, stdout: failure("invalid_config", "Broken config") }))).toEqual({ kind: "error", code: "invalid_config", message: "Broken config", guidance: "Fix the project configuration, then try again." });
    expect(initOutcome(run({ exitCode: 2, stdout: failure("usage_error", "Outside repo") }))).toMatchObject({ kind: "error", message: "Outside repo" });
    expect(initOutcome(run({ timedOut: true }))).toMatchObject({ kind: "cliError", reason: "timed out after 10 s" });
    expect(initOutcome(run({ spawnError: "ENOENT" }))).toMatchObject({ kind: "cliError", reason: "ENOENT" });
  });
  // The CLI's real envelopes (cli/internal/cli/storage.go, init.go) carry short path-free messages, so the Set
  // Up dialog's sentences for the two storage codes are the app's (draft frame setup-dialog), whatever the CLI said.
  // An exclude failure is not always a link, so its recovery is the common one. CSS guidance only follows a chosen
  // token CSS: an unrelated usage_error ("already set up", a .gitattributes directory) gets none of it.
  const G = {
    notGit: { code: "local_not_git", message: "Local storage requires a Git repository", nextSteps: ["Choose Include in Git (--storage repo), or use a Git repository"] },
    exclude: { code: "local_exclude_failed", message: "Cannot read or write the Git exclude file for Doan storage", nextSteps: ["Use a regular exclude file within 1 MiB, with readable and writable Git metadata, then retry"] },
    metadata: { code: "local_exclude_failed", message: "Cannot read Git metadata for Doan storage", nextSteps: ["Make the Git metadata readable, then retry"] },
    setUp: { code: "usage_error", message: "Project is already set up; use doan config --storage local", nextSteps: ["Run `doan config --storage local` to change this project"] },
  };
  const refusal = (error: object, exitCode: number) => run({ exitCode, stdout: envelope({ v: 1, ok: false, error }) });
  test("a refused local setup says what failed and what to do in the draft's words", () => {
    expect(initOutcome(refusal(G.notGit, 5))).toEqual({ kind: "error", code: "local_not_git", message: "This folder isn’t a Git repository, so Doan can’t keep its files out of Git.", guidance: "Choose Include in Git, or run git init here first." });
    for (const error of [G.exclude, G.metadata]) {
      expect(initOutcome(refusal(error, 5))).toEqual({ kind: "error", code: "local_exclude_failed", message: "Couldn’t add Doan’s lines to .git/info/exclude, so nothing was set up.", guidance: "Make sure the repository’s Git metadata and its exclude file can be read and written, then try again." });
    }
  });
  // A Keep out of Git setup that had to create the repository (draft keep-out-git-init, frame setup-form): the Set Up
  // form's own sentences. git_init_failed says only that nothing was set up; cleanup_failed names the .git Doan left.
  test("a refused repository creation says what failed in the Set Up form's words", () => {
    const failed = (code: string, message: string) => run({ exitCode: code === "git_missing" ? 5 : 2, stdout: failure(code, message) });
    expect(initOutcome(failed("git_missing", "Git is not installed"), { folder: "/w/new" })).toEqual({ kind: "error", code: "git_missing",
      message: "Git isn’t installed, so Doan can’t create a repository here.", guidance: "Install the Command Line Tools with xcode-select --install, then try again, or choose Include in Git." });
    expect(initOutcome(failed("git_init_failed", "git init failed"), { folder: "/w/new" })).toEqual({ kind: "error", code: "git_init_failed",
      message: "Couldn’t create a Git repository here, so nothing was set up.", guidance: "" });
    expect(initOutcome(failed("cleanup_failed", "Cannot remove /w/new/.git"), { folder: "/w/a b/new" })).toEqual({ kind: "error", code: "cleanup_failed",
      message: "Setup failed, and Doan couldn’t remove the Git repository it created at /w/a b/new/.git.", guidance: "Remove it or keep it, then try again." });
  });

  // Doan never creates a repository in the home folder or above it, so the app plans none there and the CLI refuses a
  // local setup with local_not_git; the form says why in its home-folder sentence instead of suggesting git init.
  test("a local setup refused in the home folder or above it says Doan creates no repository there", () => {
    const home = { message: "Doan doesn’t create a Git repository in your home folder.", guidance: "Choose Include in Git, or choose a folder inside it." };
    for (const folder of ["/Users/ada", "/Users", "/"]) {
      expect(initOutcome(refusal(G.notGit, 5), { folder, home: "/Users/ada" }), folder).toEqual({ kind: "error", code: "local_not_git", ...home });
    }
    for (const folder of ["/Users/ada/studio", "/Users/adam", "/w"]) {
      expect(initOutcome(refusal(G.notGit, 5), { folder, home: "/Users/ada" }), folder).toMatchObject({ guidance: "Choose Include in Git, or run git init here first." });
    }
  });

  test("CSS guidance follows only a chosen token CSS", () => {
    expect(initOutcome(refusal(G.setUp, 2))).toEqual({ kind: "error", code: "usage_error", message: "Project is already set up; use doan config --storage local", guidance: "Check the project, then try again." });
    expect(initOutcome(run({ exitCode: 2, stdout: failure("usage_error", "Token CSS must be inside the repository") }), { tokenCss: true })).toMatchObject({ guidance: "Check the project and choose a CSS file inside it, then try again." });
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
    for (const state of [{ kind: "error", message: "bad config", config: "/repo/.doan/config.json" }, { kind: "cliError", reason: "permission denied", code: "internal_error" }, { kind: "cliError", reason: "timeout" }, { kind: "uninitialized" }] as const) expect(reconcileFolders(stored, "/repo/web", state)).toEqual({ folders: stored, focus: "/repo/web" });
    expect(reconcileFolders(["/a"], "/closed", upward("/repo"))).toEqual({ folders: ["/a"], focus: null });
    expect(stored).toEqual(["/repo/web"]);
  });
});

// `doan ls` keeps a row it could not read. An older doan also sent comment counts, `commentsError` and `orphans`; the app
// shows none of them, so they are ignored, never a reason to fail the listing.
describe("folderState partial failure and an older doan's comment fields", () => {
  test("a listing with unreadable rows stays a list and keeps the rows as sent", () => {
    const rows = [{ path: ".doan/canvases/b.html", frames: [], error: { code: "unreadable_canvas", message: ".doan/canvases/b.html: permission denied" } }];
    const state = folderState(run({ stdout: envelope({ v: 1, ok: true, result: { ...listResult, canvases: rows } }) }));
    expect(state).toEqual({ kind: "list", root: "/repo", scope: [".doan/canvases", "tokens.css"], canvases: rows });
  });

  test("ignores an older doan's orphans, well-formed or not", () => {
    const orphan = { id: "checkout-v1", file: ".doan/comments/checkout-v1.jsonl", comments: { open: 2, resolved: 1 }, uncertain: false };
    for (const orphans of [[orphan], [], [null, "x"], { id: "x" }]) {
      const state = folderState(run({ stdout: envelope({ v: 1, ok: true, result: { ...listResult, orphans } }) }));
      expect(state).toEqual({ kind: "list", root: "/repo", scope: [".doan/canvases", "tokens.css"], canvases });
    }
  });
});

describe("homeOrAbove", () => {
  test("the home folder and every folder above it, never a sibling that shares its prefix", () => {
    for (const path of ["/Users/ada", "/Users/ada/", "/Users", "/"]) expect(homeOrAbove(path, "/Users/ada"), path).toBe(true);
    for (const path of ["/Users/ada/studio", "/Users/adam", "/Users/ad", "/w"]) expect(homeOrAbove(path, "/Users/ada"), path).toBe(false);
    // A home folder that cannot be known protects nothing rather than everything.
    expect(homeOrAbove("/Users/ada", "")).toBe(false);
  });

  // Saved roots are real paths, so HOME is compared as its real path: a HOME reached through a symlink (macOS's temp
  // folders under /var, which is /private/var) still refuses a repository in itself and above it.
  test("realHome reads HOME through symlinks, and keeps the spelled value when it cannot be read", () => {
    const spelled = mkdtempSync(join(tmpdir(), "doan-home-"));
    const real = realpathSync(spelled), link = join(real, "..", `${real.split("/").pop() ?? ""}-link`);
    symlinkSync(spelled, link);
    try {
      for (const home of [spelled, link]) {
        expect(realHome(home), home).toBe(real);
        expect(homeOrAbove(real, realHome(home)), home).toBe(true);
      }
      expect(realHome(join(real, "gone"))).toBe(join(real, "gone"));
      expect(realHome("")).toBe("");
    } finally { rmSync(link); rmSync(spelled, { recursive: true }); }
  });
});
