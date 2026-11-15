import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { PROMPT_MS, withFifo } from "./fifo.fixture";
import { createFingerprints, fingerprintOf } from "./seenFingerprint";

const tmp = realpathSync(mkdtempSync(join(tmpdir(), "doan-seen-fingerprint-")));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

test("a regular canvas fingerprints its bytes", async () => {
  writeFileSync(join(tmp, "a.html"), "<!doctype html>");
  expect(await createFingerprints().of(tmp, "a.html")).toBe(fingerprintOf(Buffer.from("<!doctype html>")));
});

// A listed canvas replaced by a FIFO would otherwise hold a libuv thread in open(2) until a writer appears.
test("a FIFO canvas has no fingerprint and does not block", async () => {
  const read = await withFifo(join(tmp, "pipe.html"), () => createFingerprints().of(tmp, "pipe.html"));
  expect(read.value).toBeNull();
  expect(read.ms).toBeLessThan(PROMPT_MS);
});
