import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

test("both exported inspector scripts match their TypeScript sources", () => {
  execFileSync(process.execPath, [fileURLToPath(new URL("./viewerInspect.mjs", import.meta.url)), "--check"]);
});
