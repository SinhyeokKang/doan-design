import assert from "node:assert/strict";
import { test } from "node:test";
import { parseScenarioJson, renderPrompt, selectIds } from "./scenario.ts";

test("scenario.json is read with its defaults", () => {
  assert.deepEqual(parseScenarioJson({ id: "W1", title: "t", focus: "write", init: { tokenCss: "styles/tokens.css" }, selection: null }, "W1"),
    { id: "W1", title: "t", focus: "write", init: { tokenCss: "styles/tokens.css" }, selection: null, timeoutSec: 900 });
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
