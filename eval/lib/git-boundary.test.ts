import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import * as context from "./context.ts";

for (const trigger of ["none", "fsmonitor", "clean", "process", "textconv", "external", "hook"]) {
  test(`post-agent Git preserves changes without executing ${trigger}`, () => {
    const repo = mkdtempSync(join(tmpdir(), "doan-git-boundary-"));
    const marker = join(repo, "marker"), hook = join(repo, ".git/probe");
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
    try {
      git("init", "-q");
      writeFileSync(join(repo, "tracked.txt"), "before\n");
      git("add", ".");
      git("-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "seed");
      writeFileSync(hook, `#!/bin/sh\nprintf invoked > '${marker}'\n${trigger === "clean" ? "cat" : "exit 0"}\n`, { mode: 0o755 });
      if (trigger === "fsmonitor") git("config", "core.fsmonitor", hook);
      if (trigger === "hook") { git("config", "core.hooksPath", join(repo, ".git")); writeFileSync(join(repo, ".git/post-index-change"), `#!/bin/sh\nprintf invoked > '${marker}'\n`, { mode: 0o755 }); }
      if (["clean", "process"].includes(trigger)) { git("config", `filter.probe.${trigger}`, hook); git("config", "filter.probe.required", "true"); }
      if (trigger === "textconv") git("config", "diff.probe.textconv", hook);
      if (trigger === "external") git("config", "diff.probe.command", hook);
      writeFileSync(join(repo, ".gitattributes"), "*.txt filter=probe diff=probe\n");
      writeFileSync(join(repo, "tracked.txt"), "after\n");
      writeFileSync(join(repo, "added.txt"), "added\n");
      const ws = { repo, env: process.env, seedCommit: "HEAD" };
      const ctx = context.createContext({ ...ws, agent: "fixture", transcript: "", cli: "/unused" });
      assert.deepEqual(ctx.changedFiles(), [".gitattributes", "added.txt", "tracked.txt"]);
      assert.equal(existsSync(marker), false, "changedFiles ran repo-controlled code");
      const material = context.judgeMaterial(ws, ctx);
      assert.deepEqual(material.changed, [".gitattributes", "added.txt", "tracked.txt"]);
      assert.match(material.diff, /\+after/);
      assert.match(material.diff, /\+added/);
      assert.equal(existsSync(marker), false, "judgeMaterial ran repo-controlled code");
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });
}
