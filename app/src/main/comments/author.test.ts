import { afterEach, expect, test } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readAuthor } from "./author";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
test("reads local Git configuration without shell evaluation and distinguishes absent config", async () => {
  const root = await mkdtemp(join(tmpdir(), "doan-author-")); roots.push(root);
  const config = join(root, "config");
  await writeFile(config, '[user]\n name = Human $(echo nope)\n email = human@example.test\n');
  const env = { ...process.env, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: "1" };
  expect(await readAuthor(root, env)).toEqual({ kind: "human", name: "Human $(echo nope)", email: "human@example.test" });
  await writeFile(config, "");
  await expect(readAuthor(root, env)).rejects.toThrow("Git user name");
  await writeFile(config, "broken[config");
  await expect(readAuthor(root, env)).rejects.toThrow("Git configuration");
});
