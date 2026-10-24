import { expect, test } from "vitest";
import { setupLock, type SetupLock } from "./setupLock";
const idle: SetupLock = { kind: "idle" };
const owner = { owner: 1, operation: "a" };
const other = { owner: 2, operation: "b" };
test("allows one machine writer, including during confirmation", () => {
  const writing = setupLock(idle, { type: "acquire", ...owner });
  expect(writing).toEqual({ kind: "success", state: { kind: "writing", ...owner } });
  for (const requester of [owner, other]) expect(setupLock(writing.state, { type: "acquire", ...requester })).toEqual({ kind: "busy", state: writing.state });
  const confirming = setupLock(writing.state, { type: "confirm", ...owner, confirmation: "q" });
  expect(confirming.state).toEqual({ kind: "confirming", ...owner, confirmation: "q" });
  expect(setupLock(confirming.state, { type: "acquire", ...other }).kind).toBe("busy");
  expect(setupLock(confirming.state, { type: "answer", ...other, confirmation: "q", allow: true }).kind).toBe("busy");
  expect(setupLock(confirming.state, { type: "answer", ...owner, confirmation: "old", allow: true }).kind).toBe("stale");
  expect(setupLock(confirming.state, { type: "answer", ...owner, confirmation: "q", allow: true })).toEqual(writing);
  expect(setupLock(confirming.state, { type: "answer", ...owner, confirmation: "q", allow: false })).toEqual({ kind: "success", state: idle });
});
test("only the current owner and operation can release or change the lock", () => {
  const writing: SetupLock = { kind: "writing", ...owner };
  for (const action of [{ type: "release" as const }, { type: "confirm" as const, confirmation: "q" }]) {
    expect(setupLock(writing, { ...action, ...other })).toEqual({ kind: "busy", state: writing });
    expect(setupLock(writing, { ...action, ...owner, operation: "old" })).toEqual({ kind: "stale", state: writing });
  }
  expect(setupLock(writing, { type: "release", ...owner })).toEqual({ kind: "success", state: idle });
  expect(setupLock(idle, { type: "confirm", ...owner, confirmation: "q" }).kind).toBe("stale");
  expect(setupLock(writing, { type: "answer", ...owner, confirmation: "q", allow: true }).kind).toBe("stale");
});
