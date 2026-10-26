import assert from "node:assert/strict";
import { test } from "node:test";
import { parseScenarioJson, renderPrompt, selectIds } from "./scenario.ts";

test("scenario.json is read with its defaults", () => {
  assert.deepEqual(parseScenarioJson({ id: "W1", title: "t", focus: "write", init: { tokenCss: "styles/tokens.css" }, selection: null }, "W1"),
    { id: "W1", title: "t", focus: "write", init: { tokenCss: "styles/tokens.css" }, selection: null, timeoutSec: 900, mcp: false, shellCli: true, worktree: null });
  assert.equal(parseScenarioJson({ id: "R2", title: "t", focus: "active", init: null, selection: "selection.json", timeoutSec: 60 }, "R2").timeoutSec, 60);
});

test("scenario.json that breaks the format is rejected", () => {
  const ok = { id: "W1", title: "t", focus: "write", init: null, selection: null };
  for (const bad of [{ ...ok, id: "W2" }, { ...ok, focus: "draw" }, { ...ok, init: { tokenCss: "/abs.css" } }, { ...ok, init: { tokenCss: "../x.css" } },
    { ...ok, selection: "other.json" }, { ...ok, timeoutSec: 0 }, { ...ok, extra: 1 }, { ...ok, title: "" }, [ok]])
    assert.throws(() => parseScenarioJson(bad, "W1"), Error, JSON.stringify(bad));
});

test("the prompt gets the repo path and allows no other placeholder", () => {
  assert.equal(renderPrompt("Edit {{repo}} and {{ repo }}.\n", "/tmp/x"), "Edit /tmp/x and /tmp/x.\n");
  assert.throws(() => renderPrompt("Edit {{root}}", "/tmp/x"));
});

test("real rounds leave out underscore ids; self-test keeps them", () => {
  const all = ["R1", "W1", "_example"];
  assert.deepEqual(selectIds(all, null, false), ["R1", "W1"]);
  assert.deepEqual(selectIds(all, null, true), ["R1", "W1", "_example"]);
  assert.deepEqual(selectIds(all, ["W1"], false), ["W1"]);
  assert.throws(() => selectIds(all, ["_example"], false));
  assert.throws(() => selectIds(all, ["W9"], true));
});

test("scenario MCP is opt-in and must be boolean", () => {
  const value = { id: "R2b", title: "MCP selection", focus: "active" };
  assert.equal(parseScenarioJson({ ...value, mcp: true }, "R2b").mcp, true);
  assert.equal(parseScenarioJson({ ...value, mcp: false }, "R2b").mcp, false);
  for (const mcp of [null, "true", 1, {}]) assert.throws(() => parseScenarioJson({ ...value, mcp }, "R2b"));
});

test("shellCli defaults to true and accepts only a boolean", () => {
  const value = { id: "R1b", title: "MCP comments", focus: "comments", mcp: true };
  assert.equal(parseScenarioJson(value, "R1b").shellCli, true);
  assert.equal(parseScenarioJson({ ...value, shellCli: false }, "R1b").shellCli, false);
  assert.equal(parseScenarioJson({ ...value, shellCli: true }, "R1b").shellCli, true);
  for (const shellCli of [null, "false", 0, {}]) assert.throws(() => parseScenarioJson({ ...value, shellCli }, "R1b"));
});

test("worktree is null or one branch name for the agent's second worktree", () => {
  const value = { id: "H7", title: "Worktree mismatch", focus: "comments" };
  assert.equal(parseScenarioJson(value, "H7").worktree, null);
  assert.equal(parseScenarioJson({ ...value, worktree: null }, "H7").worktree, null);
  assert.deepEqual(parseScenarioJson({ ...value, worktree: { branch: "feat-plan-copy" } }, "H7").worktree, { branch: "feat-plan-copy" });
  for (const worktree of ["feat", {}, { branch: "" }, { branch: "main" }, { branch: "Feat" }, { branch: "a/b" }, { branch: "-x" }, { branch: "x", path: "y" }, [{ branch: "x" }]])
    assert.throws(() => parseScenarioJson({ ...value, worktree }, "H7"), Error, JSON.stringify(worktree));
});
