import { expect, it } from "vitest";
import claude from "./fixtures/claude-thinking.json";
import codex from "./fixtures/codex-read.json";
import copilot from "./fixtures/acp-copilot-thought.json";
import { initialTransport, normalizeClaude, normalizeCodex } from "./transport";
import { acpPromptDone, initialAcp, normalizeAcp } from "./acp";
import type { EventPayload, TransportState } from "./types";

// turn-activity A1: each recorded turn's whole event list as the transports produce it before any stage output. Stage
// work must leave these lists exactly as they are (fixtures/README.md has the sources).
function claudeEvents(frames: readonly unknown[]): EventPayload[] {
  let state: TransportState = initialTransport();
  return frames.flatMap(frame => { const result = normalizeClaude(state, frame, "/repo"); state = result.state; return result.events; });
}
function codexEvents(frames: readonly unknown[]): EventPayload[] {
  let state: TransportState = initialTransport();
  return frames.flatMap(frame => { const result = normalizeCodex(state, frame, { root: "/repo", sessionId: "session-1", turnId: "turn-1" }); state = result.state; return result.events; });
}
function acpEvents(frames: readonly Record<string, any>[]): EventPayload[] {
  let state = initialAcp("turn-1");
  return frames.flatMap(frame => { const result = frame.method ? normalizeAcp(state, frame.params.update, "/repo") : acpPromptDone(state, frame.result); state = result.state; return result.events; });
}

const COMMAND = { type: "activity", kind: "command", summary: "Running a command" };

it("pins the Claude thinking turn's events", () => {
  const text = "src/a.ts에 `export const lantern = 1;`로 나오는 것이 답이다. notes.txt에도 이 단어가 있지만, 그 파일이 \"이 파일에만 나온다\"고 적은 문장은 사실이 아니다. 파일은 수정하지 않았다.";
  expect(claudeEvents(claude.thinking)).toEqual([
    COMMAND,
    COMMAND,
    { type: "message.delta", messageId: "msg-3:1", text: "src/a.ts에 `export const lantern = 1;`로 나오" },
    { type: "message.delta", messageId: "msg-3:1", text: "는 것이 답이다. notes.txt에도 이 단어가 있지만, 그 파일이 \"이" },
    { type: "message.delta", messageId: "msg-3:1", text: " 파일에만 나온다\"고 적은 문장은 사실이 아니다. 파일은 수정하지 않았다." },
    { type: "message.done", messageId: "msg-3:1", text },
    { type: "context.usage", used: 36386, size: 1_000_000 },
    { type: "turn.done" },
  ]);
});

it("pins the Claude subagent turn's events", () => {
  const text = "서브에이전트가 보고한 `notes.txt`의 두 번째 줄: \"The word lantern appears only in this notes file.\"\n\n(서브에이전트의 보고 내용을 그대로 전달한 것이다. 파일은 수정하지 않았다.)";
  expect(claudeEvents(claude.task)).toEqual([
    { type: "activity", kind: "other", summary: "Read notes.txt second line" },
    { type: "message.delta", messageId: "msg-3:0", text: "서브에이전트가 보고한 `notes.txt`의 두 번째 줄: \"The word " },
    { type: "message.delta", messageId: "msg-3:0", text: "lantern appears only in this notes file.\"\n\n" },
    { type: "message.delta", messageId: "msg-3:0", text: "(서브에이전트의 보고 내용을 그대로 전달한 것이다. 파일은 수정하지 않았다.)" },
    { type: "message.done", messageId: "msg-3:0", text },
    { type: "context.usage", used: 36050, size: 1_000_000 },
    { type: "turn.done" },
  ]);
});

it("pins the Codex listFiles and read turn's events", () => {
  expect(codexEvents(codex.read)).toEqual([
    { type: "message.delta", messageId: "item-2", text: "I’ll locate `notes.txt` i" },
    { type: "message.delta", messageId: "item-2", text: "n the provided workspace " },
    { type: "message.delta", messageId: "item-2", text: "and read its first line." },
    { type: "message.done", messageId: "item-2", text: "I’ll locate `notes.txt` in the provided workspace and read its first line." },
    COMMAND,
    COMMAND,
    { type: "message.delta", messageId: "item-5", text: "The first line of `not" },
    { type: "message.delta", messageId: "item-5", text: "es.txt` is: `first lin" },
    { type: "message.delta", messageId: "item-5", text: "e: the river is green`" },
    { type: "message.done", messageId: "item-5", text: "The first line of `notes.txt` is: `first line: the river is green`" },
    { type: "context.usage", used: 17237, size: 258400 },
    { type: "turn.done" },
  ]);
});

it("pins the Codex search-and-list turn's events", () => {
  expect(codexEvents(codex.search)).toEqual([
    { type: "message.delta", messageId: "item-3", text: "I’ll run a repository search for `" },
    { type: "message.delta", messageId: "item-3", text: "lantern` and list the contents of " },
    { type: "message.delta", messageId: "item-3", text: "`src`, without changing any files." },
    { type: "message.done", messageId: "item-3", text: "I’ll run a repository search for `lantern` and list the contents of `src`, without changing any files." },
    COMMAND,
    { type: "message.delta", messageId: "item-6", text: "`lantern` appears in `not" },
    { type: "message.delta", messageId: "item-6", text: "es.txt` and `src/a.ts`, a" },
    { type: "message.delta", messageId: "item-6", text: "nd `src` contains `a.ts`." },
    { type: "message.done", messageId: "item-6", text: "`lantern` appears in `notes.txt` and `src/a.ts`, and `src` contains `a.ts`." },
    { type: "context.usage", used: 13588, size: 258400 },
    { type: "turn.done" },
  ]);
});

it("pins the Copilot thought turn's events", () => {
  expect(acpEvents(copilot.turn)).toEqual([
    COMMAND,
    { type: "activity", kind: "read", path: "/repo/notes.txt", insideDesign: false, summary: "Viewing /repo/notes.txt" },
    { type: "message.delta", messageId: "turn-1:0", text: "The command output was `done`. The seco" },
    { type: "message.delta", messageId: "turn-1:0", text: "nd line of `notes.txt` is: “The word la" },
    { type: "message.delta", messageId: "turn-1:0", text: "ntern appears only in this notes file.”" },
    { type: "message.done", messageId: "turn-1:0", text: "The command output was `done`. The second line of `notes.txt` is: “The word lantern appears only in this notes file.”" },
    { type: "context.usage", used: 15019, size: 272000 },
    { type: "turn.done" },
  ]);
});
