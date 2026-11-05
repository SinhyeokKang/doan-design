import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A filesystem that refuses hard links (some network and FUSE mounts): linkSync is the one call the settings merge
// publishes with, and swapFile restores with it too, so a failure after the original was moved aside loses the path.
const refuse = vi.hoisted(() => ({ code: null as string | null }));
vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, linkSync: (from: string, to: string) => {
    if (refuse.code) throw Object.assign(new Error(`${refuse.code}: link`), { code: refuse.code });
    return actual.linkSync(from, to);
  } };
});
import { fakeCipher } from "./fixtures/cipher";
import { AuthStorage, StorageError } from "./storage";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "doan-auth-link-")); refuse.code = null; });
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
