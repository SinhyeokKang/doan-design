import { chmodSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { classifyCompletion, onboardingComplete, readCompletion, writeCompletion, type CompletionRead } from "./completion";

const FIXTURES = new URL("./fixtures/completion/", import.meta.url).pathname;
const AUTH_FIXTURE = new URL("../agentAuth/fixtures/metadata-v1.json", import.meta.url).pathname;
const ROOT = "/Users/alex/code/studio";
function fixtures(kind: "complete" | "legacy" | "unknown" | "corrupt"): [string, string][] {
  return readdirSync(join(FIXTURES, kind)).sort().map(name => [name, readFileSync(join(FIXTURES, kind, name), "utf8")]);
}

let temp: string, userData: string;
// Stored connections and registered projects live beside the marker and must survive every completion path.
const neighbours = () => ({ auth: readFileSync(join(userData, "agent-auth", "metadata.json"), "utf8"), folders: readFileSync(join(userData, "folders.json"), "utf8") });
let before: ReturnType<typeof neighbours>;
const marker = () => join(userData, "onboarding.json");
const entries = () => readdirSync(userData).sort();
beforeEach(() => {
  temp = realpathSync(mkdtempSync(join(tmpdir(), "doan-completion-")));
  userData = join(temp, "userData");
  mkdirSync(join(userData, "agent-auth"), { recursive: true });
  cpSync(AUTH_FIXTURE, join(userData, "agent-auth", "metadata.json"));
  writeFileSync(join(userData, "folders.json"), JSON.stringify(["/Users/alex/code/studio", "/Users/alex/code/other"]));
  before = neighbours();
});
afterEach(() => {
  chmodSync(userData, 0o700);
  expect(neighbours()).toEqual(before);
  // Temporary files are removed on every path, success or failure.
  expect(entries().filter(name => name.endsWith(".tmp"))).toEqual([]);
  rmSync(temp, { recursive: true, force: true });
});

test("only a v1 record with completed true and an absolute root counts as completion", () => {
  for (const [name, text] of fixtures("complete")) {
    const read = classifyCompletion(text);
    expect(read, name).toEqual({ kind: "complete", projectRoot: JSON.parse(text).projectRoot });
    expect(onboardingComplete(read), name).toBe(true);
  }
  expect(classifyCompletion(readFileSync(join(FIXTURES, "complete", "long-root.json"), "utf8"))).toMatchObject({ projectRoot: expect.stringContaining("디자인 작업") });
});

test("the legacy {} close marker never passes as the new completion", () => {
  for (const [name, text] of fixtures("legacy")) {
    expect(classifyCompletion(text), name).toEqual({ kind: "legacy" });
    expect(onboardingComplete(classifyCompletion(text)), name).toBe(false);
  }
});

test("a newer record version is reported as unknown, never as corrupt or complete", () => {
  for (const [name, text] of fixtures("unknown")) {
    expect(classifyCompletion(text), name).toEqual({ kind: "unknown_version", v: JSON.parse(text).v });
    expect(onboardingComplete(classifyCompletion(text)), name).toBe(false);
  }
});

test("malformed records, wrong types and stray fields are corrupt", () => {
  const corrupt = fixtures("corrupt");
  expect(corrupt.length).toBeGreaterThanOrEqual(13);
  for (const [name, text] of corrupt) {
    expect(classifyCompletion(text), name).toEqual({ kind: "corrupt" });
    expect(onboardingComplete(classifyCompletion(text)), name).toBe(false);
  }
});

test("an unfinished first run reads as incomplete and restarts at Welcome", () => {
  expect(readCompletion(userData)).toEqual({ kind: "missing" });
  writeFileSync(marker(), "{}\n");
  expect(readCompletion(userData)).toEqual({ kind: "legacy" });
  writeFileSync(marker(), "{\"v\":1,\"comp");
  expect(readCompletion(userData)).toEqual({ kind: "corrupt" });
  writeFileSync(marker(), "{\"v\":3}");
  expect(readCompletion(userData)).toEqual({ kind: "unknown_version", v: 3 });
  for (const read of [{ kind: "missing" }, { kind: "legacy" }, { kind: "corrupt" }, { kind: "unknown_version", v: 3 }, { kind: "unreadable", code: "EACCES" }] satisfies CompletionRead[]) expect(onboardingComplete(read)).toBe(false);
});

test("a marker that cannot be read is unreadable, not missing", () => {
  mkdirSync(marker());
  expect(readCompletion(userData)).toMatchObject({ kind: "unreadable", code: expect.any(String) });
  expect(writeCompletion(userData, ROOT)).toEqual({ ok: false, reason: "save_failed" });
  expect(readdirSync(marker())).toEqual([]);
  rmSync(marker(), { recursive: true });
});

test("completion writes the v1 record when no marker exists", () => {
  expect(writeCompletion(userData, ROOT)).toEqual({ ok: true });
  expect(readFileSync(marker(), "utf8")).toBe(`${JSON.stringify({ v: 1, completed: true, projectRoot: ROOT })}\n`);
  expect(readCompletion(userData)).toEqual({ kind: "complete", projectRoot: ROOT });
});

test("completion replaces the legacy marker and an earlier completion without a backup", () => {
  writeFileSync(marker(), "{}\n");
  expect(writeCompletion(userData, ROOT)).toEqual({ ok: true });
  expect(readCompletion(userData)).toEqual({ kind: "complete", projectRoot: ROOT });
  expect(writeCompletion(userData, "/Users/alex/code/other")).toEqual({ ok: true });
  expect(readCompletion(userData)).toEqual({ kind: "complete", projectRoot: "/Users/alex/code/other" });
  expect(entries()).toEqual(["agent-auth", "folders.json", "onboarding.json"]);
});

test("a long canonical root round-trips unchanged", () => {
  const long = JSON.parse(readFileSync(join(FIXTURES, "complete", "long-root.json"), "utf8")).projectRoot as string;
  expect(writeCompletion(userData, long)).toEqual({ ok: true });
  expect(readCompletion(userData)).toEqual({ kind: "complete", projectRoot: long });
});

test("a corrupt marker is backed up byte for byte before the new record is written", () => {
  for (const [name, text] of fixtures("corrupt")) {
    for (const entry of entries()) if (entry.startsWith("onboarding")) rmSync(join(userData, entry));
    writeFileSync(marker(), text);
    expect(writeCompletion(userData, ROOT), name).toEqual({ ok: true });
    expect(readCompletion(userData), name).toEqual({ kind: "complete", projectRoot: ROOT });
    const backups = entries().filter(entry => /^onboarding\.corrupt-[A-Za-z0-9-]+\.json$/.test(entry));
    expect(backups, name).toHaveLength(1);
    expect(readFileSync(join(userData, backups[0]!), "utf8"), name).toBe(text);
  }
});

test("a backup that cannot be made keeps the corrupt original and reports a save failure", () => {
  writeFileSync(marker(), "{\"v\":1,\"comp");
  chmodSync(userData, 0o500);
  expect(writeCompletion(userData, ROOT)).toEqual({ ok: false, reason: "save_failed" });
  chmodSync(userData, 0o700);
  expect(readFileSync(marker(), "utf8")).toBe("{\"v\":1,\"comp");
  expect(entries()).toEqual(["agent-auth", "folders.json", "onboarding.json"]);
  expect(onboardingComplete(readCompletion(userData))).toBe(false);
});

test("a record from a newer app is never overwritten", () => {
  for (const [name, text] of fixtures("unknown")) {
    writeFileSync(marker(), text);
    expect(writeCompletion(userData, ROOT), name).toEqual({ ok: false, reason: "unknown_version" });
    expect(readFileSync(marker(), "utf8"), name).toBe(text);
    expect(entries(), name).toEqual(["agent-auth", "folders.json", "onboarding.json"]);
  }
});

test("a failed write keeps the previous marker and leaves onboarding incomplete", () => {
  writeFileSync(marker(), "{}\n");
  chmodSync(userData, 0o500);
  expect(writeCompletion(userData, ROOT)).toEqual({ ok: false, reason: "save_failed" });
  chmodSync(userData, 0o700);
  expect(readFileSync(marker(), "utf8")).toBe("{}\n");
  expect(readCompletion(userData)).toEqual({ kind: "legacy" });
});

test("a missing userData directory is a save failure, not a crash", () => {
  expect(writeCompletion(join(userData, "missing"), ROOT)).toEqual({ ok: false, reason: "save_failed" });
});

test("the root must be an absolute path; main hands over only canonical roots", () => {
  for (const root of ["", "code/studio", "./studio", "/Users/alex/\0studio"]) expect(() => writeCompletion(userData, root), JSON.stringify(root)).toThrow();
  expect(readCompletion(userData)).toEqual({ kind: "missing" });
});
