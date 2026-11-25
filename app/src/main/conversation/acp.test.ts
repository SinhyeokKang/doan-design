import { describe, expect, it } from "vitest";
import { acpPermission, acpPromptDone, acpQuestion, initialAcp, normalizeAcp, type AcpTransport } from "./acp";
import copilotEdits from "./fixtures/acp-copilot-edits.json";
import antigravityEdits from "./fixtures/acp-antigravity-edits.json";
import cursor from "./fixtures/acp-cursor.json";
import type { EventPayload } from "./types";

// The shape Antigravity's ACP server 1.3.0 sent for a question: a standard permission request whose
// options are the answers, all allow_once, with no reject option.
function asked(over: Record<string, unknown> = {}, options: { optionId: string; name?: string; kind: string }[] = [{ optionId: "1", name: "Red", kind: "allow_once" }, { optionId: "2", name: "Blue", kind: "allow_once" }]) {
  return { sessionId: "s", toolCall: { toolCallId: "interaction_1", title: "Which color should the header be?", rawInput: {} }, options, ...over };
}

it("reads Antigravity's question-shaped permission request as one single-choice question with no header", () => {
  expect(acpQuestion(asked(), "req")).toEqual({
    event: { type: "question.request", requestId: "req", questions: [{ id: "0", header: "", question: "Which color should the header be?", options: [{ label: "Red" }, { label: "Blue" }], multiSelect: false, other: false }] },
    optionIds: ["1", "2"],
  });
});

it("leaves every other shape to the permission request", () => {
  const cases = [
    // A reject option means a real permission: Allow and Deny keep their meaning.
    asked({}, [{ optionId: "1", name: "Red", kind: "allow_once" }, { optionId: "2", name: "Blue", kind: "allow_once" }, { optionId: "r", name: "No", kind: "reject_once" }]),
    asked({}, [{ optionId: "1", name: "Allow", kind: "allow_once" }, { optionId: "r", name: "Deny", kind: "reject_once" }]),
    asked({}, [{ optionId: "1", name: "Red", kind: "allow_once" }, { optionId: "2", name: "Always", kind: "allow_always" }]),
    // One option is nothing to choose between.
    asked({}, [{ optionId: "1", name: "Red", kind: "allow_once" }]),
    // Two answers with the same name could not be told apart.
    asked({}, [{ optionId: "1", name: "Red", kind: "allow_once" }, { optionId: "2", name: "Red", kind: "allow_once" }]),
    asked({}, [{ optionId: "1", name: "Red", kind: "allow_once" }, { optionId: "2", name: "", kind: "allow_once" }]),
    asked({}, [{ optionId: "1", name: "Red", kind: "allow_once" }, { optionId: "2", kind: "allow_once" }]),
    asked({ toolCall: { toolCallId: "interaction_1", title: "" } }),
    asked({ toolCall: { toolCallId: "interaction_1" } }),
    asked({ toolCall: "x" }),
    asked({ options: "x" }),
    // Past the limits: refused, never cut, so the request stays answerable as a permission.
    asked({ toolCall: { toolCallId: "interaction_1", title: "q".repeat(4097) } }),
    asked({}, Array.from({ length: 9 }, (_, i) => ({ optionId: String(i), name: `Option ${i}`, kind: "allow_once" }))),
    asked({}, [{ optionId: "1", name: "R".repeat(513), kind: "allow_once" }, { optionId: "2", name: "Blue", kind: "allow_once" }]),
    asked({}, [{ optionId: "1".repeat(513), name: "Red", kind: "allow_once" }, { optionId: "2", name: "Blue", kind: "allow_once" }]),
  ];
  for (const params of cases) expect(acpQuestion(params, "req")).toBeNull();
  // At the limits it is still a question.
  expect(acpQuestion(asked({ toolCall: { title: "q".repeat(4096) } }, Array.from({ length: 8 }, (_, i) => ({ optionId: String(i), name: "n".repeat(511) + i, kind: "allow_once" }))), "req")?.event.questions[0]!.options).toHaveLength(8);
  // The same question-shaped request still reads as a permission where the runner does not take questions.
  expect(acpPermission(asked(), "req", "/repo")?.event).toMatchObject({ type: "permission.request", summary: "Which color should the header be?", options: [{ id: "allow" }] });
});

// Edit line counts (activity.callId and activity.result) over ACP. A trail line is "activity <kind> <callId|-> <path|->"
// or "result <callId> <path|-> +<added> -<removed>".
function trail(events: readonly EventPayload[]): string[] {
  return events.flatMap(e => e.type === "activity" ? [`activity ${e.kind} ${e.callId ?? "-"} ${e.path ?? "-"}`]
    : e.type === "activity.result" ? [`result ${e.callId} ${e.path ?? "-"} +${e.lines.added} -${e.lines.removed}`] : []);
}
const edit = (id: string, path: string | null) => `activity edit ${id} ${path ?? "-"}`;
const lines = (id: string, path: string | null, added: number, removed: number) => `result ${id} ${path ?? "-"} +${added} -${removed}`;
// Recorded frames fed as acpRunner feeds them: session updates as they come, a permission request's toolCall as a
// pending update (it can name the path the updates do not), the prompt's result as its end. Client replies are skipped.
function replay(frames: readonly unknown[], countsEdits: boolean): { state: AcpTransport; events: EventPayload[] } {
  let state = initialAcp("t", countsEdits);
  const events: EventPayload[] = [];
  const apply = (result: { state: AcpTransport; events: EventPayload[] }) => { state = result.state; events.push(...result.events); };
  for (const raw of frames as Record<string, unknown>[]) {
    if ("reply" in raw) continue;
    const params = (raw.params ?? {}) as Record<string, unknown>;
    if (raw.method === "session/update") apply(normalizeAcp(state, params.update as Record<string, unknown>, "/repo"));
    else if (raw.method === "session/request_permission") apply(normalizeAcp(state, { ...params.toolCall as Record<string, unknown>, sessionUpdate: "tool_call_update", status: "pending" }, "/repo"));
    else if ("result" in raw) apply(acpPromptDone(state, raw.result));
  }
  return { state, events };
}
type Recorded = Record<string, { frames: unknown[] }>;

describe("Copilot edit line counts from recorded frames", () => {
  const recorded = copilotEdits as unknown as Record<"1.0.89" | "1.0.114", Recorded>;
  const notes = "/repo/notes.txt", config = "/repo/config.txt", hello = "/repo/hello.txt";
  const c = (n: number) => `call_synthetic0${n}`, p = "custom_call_synthetic01";
  const expected: Record<"1.0.89" | "1.0.114", Record<string, string[]>> = {
    "1.0.89": {
      edit: [edit(c(1), notes), lines(c(1), notes, 1, 1)],
      write: [edit(c(1), hello), lines(c(1), hello, 3, 0)],
      overwrite: [`activity read - ${config}`, edit(c(2), config), lines(c(2), config, 2, 4)],
      // Shell commands, not edits.
      delete: ["activity command - -"],
      multipath: ["activity command - -", "activity command - -"],
      deny: [],
      fail: [],
    },
    "1.0.114": {
      // apply_patch names its file only in the permission request's rawInput.fileName.
      edit: [edit(p, notes), lines(p, notes, 1, 1)],
      write: [edit(p, hello), lines(p, hello, 3, 0)],
      // Delete and add on the same path, one result per diff item; together +2 -4.
      overwrite: [edit(p, config), lines(p, config, 0, 4), lines(p, config, 2, 0)],
      delete: [edit(p, "/repo/old.txt"), lines(p, "/repo/old.txt", 0, 3)],
      // One activity per tool call, under the path the last request named; each result carries that activity's path,
      // never its diff item's, so both attach to the one step (+1 -1 each).
      multipath: [edit(p, config), lines(p, config, 1, 1), lines(p, config, 1, 1)],
      deny: [],
      fail: [],
    },
  };
  for (const version of ["1.0.89", "1.0.114"] as const) {
    it.each(Object.keys(expected[version]))(`Copilot ${version} %s`, name => {
      const { events } = replay(recorded[version][name]!.frames, true);
      expect(trail(events)).toEqual(expected[version][name]);
      expect(events.at(-1)).toEqual({ type: "turn.done" });
    });
  }
  it("records no result where the runner does not count edits", () => {
    const { events } = replay(recorded["1.0.114"].edit!.frames, false);
    expect(trail(events)).toEqual([edit(p, notes)]);
  });
});

describe("ACP providers without edit line counts", () => {
  it.each(Object.keys((antigravityEdits as unknown as Record<"1.3.0", Recorded>)["1.3.0"]))("Antigravity 1.3.0 %s keeps its edit call ids and records no result", name => {
    const { events } = replay((antigravityEdits as unknown as Record<"1.3.0", Recorded>)["1.3.0"][name]!.frames, false);
    expect(events.some(e => e.type === "activity.result")).toBe(false);
    for (const event of events) if (event.type === "activity" && event.kind === "edit") expect(event.callId).toEqual(expect.any(String));
  });
  it("keeps a Cursor call id that holds a newline", () => {
    const { events } = replay(cursor.turn, false);
    expect(trail(events)).toContain(edit("call-564f938d-938d-4979-89e4-b78f6d606b62-1\nfc_16371e8d-cd73-9ea2-a824-02ba3c8d3b8b_1", "/repo/hello.txt"));
    expect(events.some(e => e.type === "activity.result")).toBe(false);
  });
});

describe("ACP edit line counts: synthetic updates", () => {
  const call = (id: string, over: Record<string, unknown> = {}) => ({ sessionUpdate: "tool_call", toolCallId: id, kind: "edit", title: "Edit", status: "pending", locations: [{ path: "/repo/a.txt" }], ...over });
  const update = (id: string, over: Record<string, unknown>) => ({ sessionUpdate: "tool_call_update", toolCallId: id, ...over });
  const diff = (oldText: string | null, newText: string, path = "/repo/a.txt") => ({ type: "diff", path, ...(oldText === null ? {} : { oldText }), newText });
  function run(updates: Record<string, unknown>[], countsEdits = true) {
    let state = initialAcp("t", countsEdits);
    const events: EventPayload[] = [];
    for (const u of updates) { const result = normalizeAcp(state, u, "/repo"); state = result.state; events.push(...result.events); }
    const end = acpPromptDone(state, { stopReason: "end_turn" });
    return { state: end.state, events: [...events, ...end.events] };
  }
  it("counts the diff an earlier update carried when the completion carries none (synthetic)", () => {
    expect(trail(run([call("e", { content: [diff("a\nb\n", "a\nc\n")] }), update("e", { status: "completed" })]).events)).toEqual([edit("e", "/repo/a.txt"), lines("e", "/repo/a.txt", 1, 1)]);
  });
  it("counts only the last diff content it received (synthetic)", () => {
    expect(trail(run([call("e", { content: [diff("a\n", "b\n")] }), update("e", { content: [diff("a\nb\n", "c\n")] }), update("e", { status: "completed" })]).events))
      .toEqual([edit("e", "/repo/a.txt"), lines("e", "/repo/a.txt", 1, 2)]);
  });
  it("reads a diff without oldText as a new file (synthetic)", () => {
    expect(trail(run([call("e"), update("e", { status: "completed", content: [diff(null, "x\ny\n")] })]).events).at(-1)).toBe(lines("e", "/repo/a.txt", 2, 0));
  });
  it("records nothing for a failed call that carried a diff (synthetic)", () => {
    expect(trail(run([call("e", { content: [diff("a\n", "b\n")] }), update("e", { status: "failed" })]).events)).toEqual([]);
  });
  it("leaves out a diff item it cannot count, past the line limit or without text (synthetic)", () => {
    const long = "x\n".repeat(20_001);
    expect(trail(run([call("e"), update("e", { status: "completed", content: [diff("", long), { type: "diff", path: "/repo/a.txt", oldText: "a" }, { type: "content", content: { type: "text", text: "ok" } }] })]).events))
      .toEqual([edit("e", "/repo/a.txt")]);
  });
  it("carries no path on the result of an activity that has none (synthetic)", () => {
    expect(trail(run([call("e", { locations: [] }), update("e", { status: "completed", content: [diff("a\n", "b\n", "/repo/b.txt")] })]).events)).toEqual([edit("e", null), lines("e", null, 1, 1)]);
  });
  it.each([["past the label limit", "x".repeat(513)], ["holding a NUL", "call\0x"]])("gives a call id %s no callId and no result, and the turn goes on (synthetic)", (_name, id) => {
    const { events } = run([call(id, { content: [diff("a\n", "b\n")] }), update(id, { status: "completed" })]);
    expect(events.filter(e => e.type === "activity")).toEqual([{ type: "activity", kind: "edit", path: "/repo/a.txt", insideDesign: false, summary: "Edit" }]);
    expect(events.some(e => e.type === "activity.result")).toBe(false);
    expect(events.at(-1)).toEqual({ type: "turn.done" });
  });
  it("keeps an id at the label limit (synthetic)", () => {
    const id = "x".repeat(512);
    expect(trail(run([call(id), update(id, { status: "completed", content: [diff("a\n", "b\n")] })]).events)).toEqual([edit(id, "/repo/a.txt"), lines(id, "/repo/a.txt", 1, 1)]);
  });
  it("records nothing once the turn ended (synthetic)", () => {
    const { state } = run([call("e", { content: [diff("a\n", "b\n")] })]);
    expect(normalizeAcp(state, update("e", { status: "completed" }), "/repo").events).toEqual([]);
  });
});
