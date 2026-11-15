import * as fs from "node:fs";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { PROMPT_MS, withFifo } from "../fifo.fixture";
import { swapFile } from "./swap";

let dir: string;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

// Another writer in the folder can put a FIFO at the aside name between swapFile's lstat and its read; a blocking read
// would hold main until a writer opened it.
it("does not block on a FIFO that replaces the moved-aside file after its check", async () => {
  dir = mkdtempSync(join(tmpdir(), "doan-swap-"));
  const path = join(dir, "settings.json"), staged = join(dir, "staged"), aside = join(dir, ".doan-x.aside"), fifo = join(dir, "fifo");
  writeFileSync(path, "{}"); writeFileSync(staged, '{"a":1}');
  const seen = fs.lstatSync(path);
  let swapped = false;
  const lstatSync = ((p: string) => {
    const stat = fs.lstatSync(p);
    // Both names stay links to the FIFO, so the fixture's rescuer can still release a reader that blocked.
    if (p === aside && !swapped) { swapped = true; fs.linkSync(fifo, `${aside}.next`); fs.renameSync(`${aside}.next`, aside); }
    return stat;
  }) as typeof fs.lstatSync;
  const { value, ms } = await withFifo(fifo, () => swapFile({ ...fs, lstatSync },
    { path, staged, id: `${seen.dev}:${seen.ino}`, bytes: Buffer.from("{}"), aside, parent: null }));
  expect(ms).toBeLessThan(PROMPT_MS);
  expect(value).toEqual({ kind: "displaced", at: aside });
  expect(fs.existsSync(path)).toBe(false);
});
