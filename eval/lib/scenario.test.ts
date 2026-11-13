import assert from "node:assert/strict";
import { test } from "node:test";
import { parseScenarioJson, renderPrompt, selectIds } from "./scenario.ts";

test("scenario.json is read with its defaults", () => {
  assert.deepEqual(parseScenarioJson({ id: "W1", title: "t", focus: "write", init: { tokenCss: "styles/tokens.css" }, selection: null }, "W1"),
    { id: "W1", title: "t", focus: "write", init: { tokenCss: "styles/tokens.css" }, selection: null, timeoutSec: 900, shellCli: true, git: true, worktree: null, onboarding: null, handoff: null });
  assert.equal(parseScenarioJson({ id: "R2", title: "t", focus: "active", init: null, selection: "selection.json", timeoutSec: 60 }, "R2").timeoutSec, 60);
});

test("scenario.json that breaks the format is rejected", () => {
  const ok = { id: "W1", title: "t", focus: "write", init: null, selection: null };
  for (const bad of [{ ...ok, id: "W2" }, { ...ok, focus: "draw" }, { ...ok, init: { tokenCss: "/abs.css" } }, { ...ok, init: { tokenCss: "../x.css" } },
    { ...ok, selection: "other.json" }, { ...ok, timeoutSec: 0 }, { ...ok, extra: 1 }, { ...ok, mcp: false }, { ...ok, title: "" }, [ok]])
    assert.throws(() => parseScenarioJson(bad, "W1"), Error, JSON.stringify(bad));
});

test("preset mapping is a scenario focus without adding tool restrictions", () => {
  const value = { id: "P1", title: "Preset mapping", focus: "preset" };
  const parsed = parseScenarioJson(value, "P1");
  assert.equal(parsed.focus, "preset");
  assert.equal(parsed.shellCli, true);
  for (const focus of ["presets", "design-skill", null, 1])
    assert.throws(() => parseScenarioJson({ ...value, focus }, "P1"), /focus must be one of/);
});

test("the prompt gets the repo path and allows no other placeholder", () => {
  assert.equal(renderPrompt("Edit {{repo}} and {{ repo }}.\n", "/tmp/x"), "Edit /tmp/x and /tmp/x.\n");
  assert.throws(() => renderPrompt("Edit {{root}}", "/tmp/x"));
});

test("real rounds leave out underscore ids; self-test keeps them", () => {
  const all = ["R2", "W1", "_example"];
  assert.deepEqual(selectIds(all, null, false), ["R2", "W1"]);
  assert.deepEqual(selectIds(all, null, true), ["R2", "W1", "_example"]);
  assert.deepEqual(selectIds(all, ["W1"], false), ["W1"]);
  assert.throws(() => selectIds(all, ["_example"], false));
  assert.throws(() => selectIds(all, ["W9"], true));
});

test("shellCli defaults to true and accepts only a boolean", () => {
  const value = { id: "D4", title: "No shell CLI", focus: "preset" };
  assert.equal(parseScenarioJson(value, "D4").shellCli, true);
  assert.equal(parseScenarioJson({ ...value, shellCli: false }, "D4").shellCli, false);
  assert.equal(parseScenarioJson({ ...value, shellCli: true }, "D4").shellCli, true);
  for (const shellCli of [null, "false", 0, {}]) assert.throws(() => parseScenarioJson({ ...value, shellCli }, "D4"));
});

test("onboarding is null or the scenario's app-socket v2 script", () => {
  const value = { id: "O1", title: "Onboarding", focus: "onboarding" };
  assert.equal(parseScenarioJson(value, "O1").onboarding, null);
  assert.equal(parseScenarioJson({ ...value, onboarding: "onboarding.json" }, "O1").onboarding, "onboarding.json");
  for (const onboarding of ["other.json", true, {}]) assert.throws(() => parseScenarioJson({ ...value, onboarding }, "O1"), Error, JSON.stringify(onboarding));
});

test("worktree is null or one branch name for the agent's second worktree", () => {
  const value = { id: "R8", title: "Worktree mismatch", focus: "write" };
  assert.equal(parseScenarioJson(value, "R8").worktree, null);
  assert.equal(parseScenarioJson({ ...value, worktree: null }, "R8").worktree, null);
  assert.deepEqual(parseScenarioJson({ ...value, worktree: { branch: "feat-plan-copy" } }, "R8").worktree, { branch: "feat-plan-copy" });
  for (const worktree of ["feat", {}, { branch: "" }, { branch: "main" }, { branch: "Feat" }, { branch: "a/b" }, { branch: "-x" }, { branch: "x", path: "y" }, [{ branch: "x" }]])
    assert.throws(() => parseScenarioJson({ ...value, worktree }, "R8"), Error, JSON.stringify(worktree));
});

test("handoff is null or the canvas the conversation works on", () => {
  const value = { id: "R10", title: "t", focus: "write", init: null, selection: null };
  assert.equal(parseScenarioJson(value, "R10").handoff, null);
  assert.deepEqual(parseScenarioJson({ ...value, handoff: { canvas: ".doan/canvases/account.html" } }, "R10").handoff, { canvas: ".doan/canvases/account.html" });
  for (const handoff of ["account", {}, { canvas: "" }, { canvas: "account.html" }, { canvas: ".doan/ds/button.html" }, { canvas: ".doan/canvases/a/b.html" }, { canvas: ".doan/canvases/a.html", key: "x" }, [{ canvas: ".doan/canvases/a.html" }]])
    assert.throws(() => parseScenarioJson({ ...value, handoff }, "R10"), Error, JSON.stringify(handoff));
});

test("git defaults to true, accepts only a boolean, and cannot be false with a worktree", () => {
  const value = { id: "O5", title: "Outside Git", focus: "onboarding" };
  assert.equal(parseScenarioJson(value, "O5").git, true);
  assert.equal(parseScenarioJson({ ...value, git: false }, "O5").git, false);
  assert.equal(parseScenarioJson({ ...value, git: true }, "O5").git, true);
  for (const git of [null, "false", 0, {}]) assert.throws(() => parseScenarioJson({ ...value, git }, "O5"), Error, JSON.stringify(git));
  assert.throws(() => parseScenarioJson({ ...value, git: false, worktree: { branch: "second" } }, "O5"), /worktree/);
});
