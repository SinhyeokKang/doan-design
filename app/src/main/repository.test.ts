import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { REPOSITORY_URL } from "./repository";
import { releaseNotesUrl } from "./update/service";

// The star card and Release Notes ↗ open the repository electron-builder publishes releases to; a move of the repository
// must change both, not one.
test("the repository URL is the one releases are published to", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { build: { publish: { provider: string; owner: string; repo: string } } };
  const { provider, owner, repo } = manifest.build.publish;
  expect(provider).toBe("github");
  expect(REPOSITORY_URL).toBe(`https://github.com/${owner}/${repo}`);
});

test("Release Notes ↗ opens a release page of that repository", () => {
  expect(releaseNotesUrl({ version: "0.1.0", state: { kind: "ready", version: "0.2.0" }, eligibility: { kind: "enabled" }, gate: { kind: "allowed" }, autoCheck: true, lastCheckedAt: null }))
    .toBe(`${REPOSITORY_URL}/releases/tag/v0.2.0`);
});
