import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createContext } from "../../lib/context.ts";
import checks from "./checks.ts";

// The agent's repository is untrusted after the run: reading its Git state must not start a helper it configured.
test("O4 reads the agent's Git state without running its fsmonitor or hooks", () => {
  const repo = mkdtempSync(join(tmpdir(), "doan-o4-checks-"));
  const marker = join(repo, "marker"), helper = join(repo, ".git/probe");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
  try {
    cpSync(join(import.meta.dirname, "seed"), repo, { recursive: true });
    git("init", "-q");
    git("add", "-A");
    git("-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "seed");
    writeFileSync(helper, `#!/bin/sh\nprintf invoked > '${marker}'\nexit 0\n`, { mode: 0o755 });
    git("config", "core.fsmonitor", helper);
    git("config", "core.hooksPath", join(repo, ".git"));
    writeFileSync(join(repo, ".git/post-index-change"), `#!/bin/sh\nprintf invoked > '${marker}'\n`, { mode: 0o755 });
    const results = checks(createContext({ repo, agent: "fixture", transcript: "", cli: "/unused", env: process.env, seedCommit: "HEAD" }));
    assert.equal(existsSync(marker), false, "O4's checks ran repo-controlled code");
    // The Git reads still answer: one commit, nothing tracked under .doan.
    assert.equal(results.find(c => c.id === "no_commit")!.pass, true);
    assert.equal(results.find(c => c.id === "doan_untracked")!.pass, true);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
