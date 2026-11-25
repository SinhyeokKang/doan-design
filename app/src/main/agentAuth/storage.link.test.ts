import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A filesystem that refuses hard links (some network and FUSE mounts): linkSync is the one call the settings merge
// publishes with, and swapFile restores with it too, so a failure after the original was moved aside loses the path.
const refuse = vi.hoisted(() => ({ code: null as string | null, named: [] as string[] }));
vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, linkSync: (from: string, to: string) => {
    refuse.named.push(from, to);
    if (refuse.code) throw Object.assign(new Error(`${refuse.code}: link`), { code: refuse.code });
    return actual.linkSync(from, to);
  }, renameSync: (from: string, to: string) => { refuse.named.push(from, to); return actual.renameSync(from, to); } };
});
import { fakeCipher } from "./fixtures/cipher";
import { AuthStorage, StorageError } from "./storage";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "doan-auth-link-")); refuse.code = null; refuse.named = []; });
afterEach(() => { refuse.code = null; rmSync(root, { recursive: true, force: true }); });

describe("merged profile settings on a filesystem without hard links", () => {
  it.each(["ENOTSUP", "EPERM"])("keeps the existing settings file in place when linking fails with %s", code => {
    const storage = new AuthStorage(root, fakeCipher());
    const dir = storage.profileDir("claude"), path = join(dir, "settings.json");
    writeFileSync(path, '{"model":"kept"}');
    refuse.code = code;
    expect(() => storage.writeSetting("claude", "settings.json", () => '{"model":"kept","rules":1}')).toThrow(StorageError);
    expect(readFileSync(path, "utf8")).toBe('{"model":"kept"}');
    expect(readdirSync(dir).filter(name => name.startsWith(".") || name.endsWith(".tmp") || name.endsWith(".aside"))).toEqual([]);
  });
});

// A fenced Claude turn can write the profile folder, so a file it renamed onto Doan's staged or moved-aside name would
// become settings.json. Doan's temporary names live in the agent-auth folder, which the fence closes.
it("keeps the settings merge's temporary names out of the profile folder", () => {
  const storage = new AuthStorage(root, fakeCipher());
  const dir = storage.profileDir("claude"), path = join(dir, "settings.json");
  writeFileSync(path, '{"model":"kept"}');
  storage.writeSetting("claude", "settings.json", () => '{"model":"kept","rules":1}');
  expect(readFileSync(path, "utf8")).toBe('{"model":"kept","rules":1}');
  const temporary = [...new Set(refuse.named)].filter(name => name !== path);
  expect(temporary.length).toBeGreaterThanOrEqual(3);
  for (const name of temporary) expect(join(name, "..")).toBe(root);
});
