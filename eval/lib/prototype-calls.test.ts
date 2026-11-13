import assert from "node:assert/strict";
import { test } from "node:test";
import { prototypeCalls } from "./prototype.ts";
import { doanPositionals } from "./transcript.ts";

test("prototype calls recognize CLI flag arities, paths and true boolean spellings", () => {
  assert.deepEqual(doanPositionals(["doan", "open", "a.html", "--frame", "phone", "--prototype"]), ["open", "a.html"]);
  assert.deepEqual(prototypeCalls(["doan export a.html --frame phone --prototype -o ../out.html"], "export"), [{ path: "a.html", frame: "phone", prototype: true, output: "../out.html" }]);
  assert.deepEqual(prototypeCalls(["/tmp/doan --repo /repo open --prototype=true --frame=phone a.html"], "open"), [{ path: "a.html", frame: "phone", prototype: true, output: undefined }]);
});

test("prototype call evidence excludes printed commands and distinguishes navigation and false flags", () => {
  assert.deepEqual(prototypeCalls(["echo 'doan open a.html --frame phone --prototype'", "doan export a.html --frame phone --prototype -o out.html"], "open"), []);
  for (const command of ["doan open a.html --frame phone", "doan open a.html --frame phone --prototype=false", "doan open a.html --frame=phone --prototype=0", "doan open a.html --frame --prototype"])
    assert.equal(prototypeCalls([command], "open")[0]?.prototype, false, command);
});
