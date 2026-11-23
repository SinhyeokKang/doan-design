import assert from "node:assert/strict";
import { test } from "node:test";
import { prototypeCalls } from "./prototype.ts";
import { doanPositionals } from "./transcript.ts";

test("prototype calls recognize CLI flag arities, paths and true boolean spellings", () => {
  assert.deepEqual(doanPositionals(["doan", "open", "a.html", "--frame", "phone", "--prototype"]), ["open", "a.html"]);
  assert.deepEqual(prototypeCalls(["doan export a.html --frame phone --prototype -o ../out.html"], "export"), [{ path: "a.html", frame: "phone", prototype: true, output: "../out.html" }]);
  assert.deepEqual(prototypeCalls(["/tmp/doan open --repo /repo --prototype=true --frame=phone a.html"], "open"), [{ path: "a.html", frame: "phone", prototype: true, output: undefined }]);
});

test("prototype call evidence excludes printed commands and distinguishes navigation and false flags", () => {
  assert.deepEqual(prototypeCalls(["echo 'doan open a.html --frame phone --prototype'", "doan export a.html --frame phone --prototype -o out.html"], "open"), []);
  for (const command of ["doan open a.html --frame phone", "doan open a.html --frame phone --prototype=false", "doan open a.html --frame=phone --prototype=0", "doan open a.html --frame --prototype"])
    assert.equal(prototypeCalls([command], "open")[0]?.prototype, false, command);
});

// Every value flag the CLI defines takes the next word, so a flag-looking value is never read as --prototype or --frame.
test("prototype call evidence reads flag values with the CLI's whole flag set", () => {
  assert.deepEqual(prototypeCalls(["doan open a.html --frame --prototype"], "open"), [{ path: "a.html", frame: "--prototype", prototype: false, output: undefined }]);
  assert.deepEqual(prototypeCalls(["doan export a.html --frame=hero -o --prototype --prototype"], "export"), [{ path: "a.html", frame: "hero", prototype: true, output: "--prototype" }]);
  // The CLI refuses a flag its command does not take, so such a command asked for nothing.
  assert.deepEqual(prototypeCalls(["doan open a.html --note --prototype --frame phone"], "open"), []);
  assert.deepEqual(prototypeCalls(["doan export a.html --session --frame=hero --request -o --prototype"], "export"), []);
});
