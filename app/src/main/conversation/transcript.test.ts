import { afterEach, describe, expect, it } from "vitest";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeTranscript, readInTranscript, readTranscriptFrom, transcriptSize } from "./io";

// Real session JSONL lines of Claude Code 2.1.284 and 2.1.322 (PoC), with paths, account ids and environment removed.
const fixture = (version: string, kind: string) => ({
  text: readFileSync(new URL(`./fixtures/claude-transcript-${version}-${kind}.jsonl`, import.meta.url), "utf8"),
  ids: JSON.parse(readFileSync(new URL(`./fixtures/claude-transcript-${version}-${kind}.meta.json`, import.meta.url), "utf8")) as { promptUuid: string; steerUuid: string },
});
const OTHER = "00000000-0000-4000-8000-0000000000ff";
describe.each(["2.1.284", "2.1.322"])("readInTranscript on Claude Code %s", version => {
  it("finds a normal turn's prompt (user.uuid)", () => {
    const { text, ids } = fixture(version, "followup");
    expect(readInTranscript(text, [ids.promptUuid, OTHER])).toEqual([ids.promptUuid]);
  });
  it("finds a steer folded into the running turn (attachment queued_command source_uuid)", () => {
    const { text, ids } = fixture(version, "folded");
    expect(readInTranscript(text, [ids.steerUuid])).toEqual([ids.steerUuid]);
  });
  it("finds a steer read as a follow-up turn (user.uuid)", () => {
    const { text, ids } = fixture(version, "followup");
    expect(readInTranscript(text, [ids.steerUuid])).toEqual([ids.steerUuid]);
  });
  it.each(["stop-term", "stop-kill"])("does not find a steer the group stopped before it was read (%s): only its uuid-less enqueue line is there", kind => {
    const { text, ids } = fixture(version, kind);
    expect(text).toContain("queue-operation");
    expect(readInTranscript(text, [ids.steerUuid])).toEqual([]);
  });
});
describe("readInTranscript", () => {
  const user = (uuid: string) => JSON.stringify({ type: "user", uuid, message: { role: "user", content: "x" } });
  it("ignores a cut first line, broken lines and uuids in other fields", () => {
    const appended = `d","type":"user","uuid":"${OTHER}"}\nnot json\n${JSON.stringify({ type: "assistant", uuid: OTHER })}\n${JSON.stringify({ type: "queue-operation", operation: "enqueue", content: OTHER })}\n${JSON.stringify({ type: "attachment", attachment: { type: "other", source_uuid: OTHER } })}\n`;
    expect(readInTranscript(appended, [OTHER])).toEqual([]);
  });
  it("answers each uuid once, in the order asked, and nothing for an empty read", () => {
    const a = "00000000-0000-4000-8000-00000000000a", b = "00000000-0000-4000-8000-00000000000b";
    expect(readInTranscript(`${user(b)}\n${user(a)}\n${user(a)}`, [a, b])).toEqual([a, b]);
    expect(readInTranscript("", [a])).toEqual([]);
    expect(readInTranscript(user(a), [])).toEqual([]);
  });
});
describe("reading a Claude session transcript after a size", () => {
  const dirs: string[] = []; afterEach(() => { dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })); });
  function profile() { const dir = realpathSync(mkdtempSync(join(tmpdir(), "doan-transcript-"))); dirs.push(dir); mkdirSync(join(dir, "projects", "-repo"), { recursive: true }); return dir; }
  it("finds the session's file under any project directory and reads only the bytes after the size taken at acceptance", () => {
    const config = profile(), id = "11111111-1111-4111-8111-111111111111", path = join(config, "projects", "-repo", `${id}.jsonl`);
    expect(claudeTranscript(config, id)).toBeNull();
    expect(transcriptSize(config, id)).toBe(0);
    writeFileSync(path, `${JSON.stringify({ type: "user", uuid: OTHER })}\n`);
    expect(claudeTranscript(config, id)).toBe(path);
    const from = transcriptSize(config, id);
    appendFileSync(path, `${JSON.stringify({ type: "user", uuid: "00000000-0000-4000-8000-00000000000c" })}\n`);
    const appended = readTranscriptFrom(config, id, from);
    expect(appended).not.toContain(OTHER);
    expect(readInTranscript(appended!, ["00000000-0000-4000-8000-00000000000c"])).toEqual(["00000000-0000-4000-8000-00000000000c"]);
  });
  it("reads from the start of a session that had no file at acceptance, and nothing for a bad id or a missing file", () => {
    const config = profile(), id = "22222222-2222-4222-8222-222222222222";
    expect(readTranscriptFrom(config, id, 0)).toBeNull();
    writeFileSync(join(config, "projects", "-repo", `${id}.jsonl`), `${JSON.stringify({ type: "user", uuid: OTHER })}\n`);
    expect(readTranscriptFrom(config, id, 0)).toContain(OTHER);
    expect(readTranscriptFrom(config, "../x", 0)).toBeNull();
    // A file that shrank since (rewritten) is read from its start.
    expect(readTranscriptFrom(config, id, 1 << 20)).toContain(OTHER);
  });
});
