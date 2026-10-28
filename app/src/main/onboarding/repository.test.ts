import { expect, test } from "vitest";
import { findCandidates, folderMatch, parseGitHubUrl, remoteRepository, sameRepository, type ProjectRemotes } from "./repository";

const studio = { owner: "acme", repository: "studio" };

test("the three approved GitHub root URL forms are accepted with or without .git and one trailing slash", () => {
  const cases: [string, "https" | "ssh", string][] = [
    ["https://github.com/acme/studio", "https", "https://github.com/acme/studio"],
    ["https://github.com/acme/studio.git", "https", "https://github.com/acme/studio.git"],
    ["https://github.com/acme/studio/", "https", "https://github.com/acme/studio"],
    ["https://github.com/acme/studio.git/", "https", "https://github.com/acme/studio.git"],
    ["git@github.com:acme/studio", "ssh", "git@github.com:acme/studio"],
    ["git@github.com:acme/studio.git", "ssh", "git@github.com:acme/studio.git"],
    ["git@github.com:acme/studio/", "ssh", "git@github.com:acme/studio"],
    ["ssh://git@github.com/acme/studio", "ssh", "ssh://git@github.com/acme/studio"],
    ["ssh://git@github.com/acme/studio.git/", "ssh", "ssh://git@github.com/acme/studio.git"],
  ];
  for (const [input, transport, url] of cases) expect(parseGitHubUrl(input), input).toEqual({ ...studio, transport, url });
});

test("names keep their case, and allowed characters, pasted whitespace and length limits are honoured", () => {
  expect(parseGitHubUrl("https://github.com/Acme-Labs/My.Repo_name-2")).toMatchObject({ owner: "Acme-Labs", repository: "My.Repo_name-2" });
  expect(parseGitHubUrl("  https://github.com/acme/studio\n")).toMatchObject(studio);
  expect(parseGitHubUrl("HTTPS://GitHub.com/acme/studio")).toMatchObject(studio);
  expect(parseGitHubUrl(`https://github.com/${"a".repeat(39)}/${"r".repeat(100)}`)).not.toBeNull();
  expect(parseGitHubUrl(`https://github.com/${"a".repeat(40)}/studio`)).toBeNull();
  expect(parseGitHubUrl(`https://github.com/acme/${"r".repeat(101)}`)).toBeNull();
  // .git is a suffix, not part of the name; a name that is only .git is empty.
  expect(parseGitHubUrl("https://github.com/acme/studio.git.git")).toMatchObject({ repository: "studio.git" });
});

test("hosts, ports, credentials, queries, fragments, extra paths and option-like input are rejected", () => {
  const rejected = [
    "", "   ", "github.com/acme", "github.com/acme/studio", "acme/studio",
    "http://github.com/acme/studio", "git://github.com/acme/studio", "file:///Users/alex/studio",
    "https://gitlab.com/acme/studio", "https://www.github.com/acme/studio", "https://github.com.evil.example/acme/studio",
    "https://evil.example/github.com/acme/studio", "https://github.com:443/acme/studio", "ssh://git@github.com:22/acme/studio",
    "https://user:token@github.com/acme/studio", "https://token@github.com/acme/studio", "ssh://alice@github.com/acme/studio",
    "alice@github.com:acme/studio", "ssh://git:pw@github.com/acme/studio",
    "https://github.com/acme/studio?tab=readme", "https://github.com/acme/studio#readme", "https://github.com/acme/studio/tree/main",
    "https://github.com/acme", "https://github.com/acme/", "https://github.com/acme/studio//", "https://github.com//acme/studio",
    "git@github.com:/acme/studio", "git@github.com:acme/studio/extra", "git@github.com:acme",
    "https://github.com/-acme/studio", "https://github.com/acme-/studio", "https://github.com/ac_me/studio",
    "https://github.com/acme/.", "https://github.com/acme/..", "https://github.com/acme/.git", "https://github.com/acme/st%75dio",
    "https://github.com/acme/my studio", "https://github.com/acme/studio\nhttps://github.com/acme/other", "https://github.com/acme\\studio",
    "-c core.sshCommand=touch", "--upload-pack=touch", "-https://github.com/acme/studio",
  ];
  for (const input of rejected) expect(parseGitHubUrl(input), JSON.stringify(input)).toBeNull();
});

test("repository identity ignores case and transport", () => {
  const https = parseGitHubUrl("https://github.com/Acme/Studio.git")!, ssh = parseGitHubUrl("git@github.com:acme/studio")!;
  expect(sameRepository(https, ssh)).toBe(true);
  expect(sameRepository(https, parseGitHubUrl("https://github.com/acme/studio-2")!)).toBe(false);
  expect(sameRepository(https, parseGitHubUrl("https://github.com/acme2/studio")!)).toBe(false);
});

test("configured remotes also match through credentials, other users and git:// without exposing them", () => {
  for (const url of [
    "https://github.com/acme/studio.git", "https://x-access-token:secret@github.com/acme/studio.git", "https://alex@github.com/Acme/Studio",
    "git@github.com:acme/studio.git", "org-1@github.com:acme/studio.git", "ssh://git@github.com/acme/studio", "ssh://git@github.com:22/acme/studio.git",
    "git://github.com/acme/studio.git", "http://github.com/acme/studio",
  ]) {
    const repo = remoteRepository(url);
    expect(repo, url).toEqual({ owner: expect.stringMatching(/^acme$/i), repository: expect.stringMatching(/^studio$/i) });
    expect(JSON.stringify(repo), url).not.toContain("secret");
  }
  for (const url of ["https://gitlab.com/acme/studio.git", "github-work:acme/studio.git", "/Users/alex/mirror/studio.git", "../studio", "https://github.com/acme", "https://github.com:8443/acme/studio", ""]) expect(remoteRepository(url), url).toBeNull();
});

test("a folder matches when any remote URL names the repository; a read failure is unknown, not a mismatch", () => {
  expect(folderMatch(studio, { ok: true, urls: ["git@github.com:someone/fork.git", "https://github.com/acme/studio"], uncertain: false })).toBe("match");
  expect(folderMatch(studio, { ok: true, urls: ["git@github.com:someone/fork.git"], uncertain: false })).toBe("mismatch");
  expect(folderMatch(studio, { ok: true, urls: [], uncertain: false })).toBe("mismatch");
  expect(folderMatch(studio, { ok: false, reason: "not_repository" })).toBe("mismatch");
  expect(folderMatch(studio, { ok: false, reason: "unreadable" })).toBe("unknown");
  // A conditional include that was not followed may hold the matching remote.
  expect(folderMatch(studio, { ok: true, urls: ["git@github.com:someone/fork.git"], uncertain: true })).toBe("unknown");
  expect(folderMatch(studio, { ok: true, urls: ["https://github.com/acme/studio"], uncertain: true })).toBe("match");
});

test("candidates are deduplicated by canonical root and keep registration order", () => {
  const match = { ok: true, urls: ["https://github.com/acme/studio.git", "git@github.com:acme/studio.git"], uncertain: false } as const;
  const other = { ok: true, urls: ["https://github.com/acme/other"], uncertain: false } as const;
  const projects: ProjectRemotes[] = [
    { root: "/Users/alex/code/other", remotes: other },
    { root: "/Users/alex/code/studio", remotes: match },
    { root: "/Users/alex/code/studio", remotes: match },
  ];
  expect(findCandidates(studio, projects)).toEqual({ kind: "one", roots: ["/Users/alex/code/studio"], unknown: [] });
});

test("several checkouts or worktrees of one repository need a choice", () => {
  const match = { ok: true, urls: ["https://github.com/acme/studio.git"], uncertain: false } as const;
  const projects: ProjectRemotes[] = [
    { root: "/Users/alex/worktrees/studio/auth", remotes: match },
    { root: "/Users/alex/code/studio", remotes: match },
  ];
  expect(findCandidates(studio, projects)).toEqual({ kind: "many", roots: ["/Users/alex/worktrees/studio/auth", "/Users/alex/code/studio"], unknown: [] });
});

test("no candidate leads to clone; unreadable projects are listed apart instead of counted as mismatches", () => {
  expect(findCandidates(studio, [])).toEqual({ kind: "none", roots: [], unknown: [] });
  const projects: ProjectRemotes[] = [
    { root: "/Users/alex/code/broken", remotes: { ok: false, reason: "unreadable" } },
    { root: "/Users/alex/code/plain", remotes: { ok: false, reason: "not_repository" } },
    { root: "/Users/alex/code/broken", remotes: { ok: false, reason: "unreadable" } },
  ];
  expect(findCandidates(studio, projects)).toEqual({ kind: "none", roots: [], unknown: ["/Users/alex/code/broken"] });
});
