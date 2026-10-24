import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { assertOutsideCheckout, findCheckout } from "./isolate.ts";

test("a path inside a checkout or a doan project is refused", () => {
  const base = realpathSync(mkdtempSync("/tmp/doan-eval-test-"));
  try {
    mkdirSync(join(base, "outer/.git"), { recursive: true });
    mkdirSync(join(base, "doan/.doan/x"), { recursive: true });
    assert.equal(findCheckout(join(base, "outer/a/b")), join(base, "outer"));
    assert.equal(findCheckout(join(base, "doan/.doan/x")), join(base, "doan"));
    assert.throws(() => assertOutsideCheckout(join(base, "outer/a")));
    assert.throws(() => assertOutsideCheckout(import.meta.dirname));
    assert.equal(findCheckout(join(base, "free")), null);
    assertOutsideCheckout(join(base, "free"));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
