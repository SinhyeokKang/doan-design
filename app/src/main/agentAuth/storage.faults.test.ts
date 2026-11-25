import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// shortWrite: the next writeSync writes only half its buffer and says so, as a full disk or quota can. lstatAs: an lstat
// of `from` describes `to` instead, so a file can be swapped for something else between Doan's lstat and its read.
// removedTrees: every recursive rmSync target, to see where a planted folder's tree is removed.
const hooks = vi.hoisted(() => ({ shortWrite: false, lstatAs: null as { from: string; to: string } | null, removedTrees: [] as string[] }));
vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    writeSync: (...args: Parameters<typeof actual.writeSync>) => {
      const [fd, buffer] = args;
      if (hooks.shortWrite && Buffer.isBuffer(buffer)) { hooks.shortWrite = false; return actual.writeSync(fd, buffer.subarray(0, buffer.length >> 1)); }
      return (actual.writeSync as (...a: Parameters<typeof actual.writeSync>) => number)(...args);
    },
    rmSync: (path: import("node:fs").PathLike, options?: import("node:fs").RmOptions) => {
      if (options?.recursive) hooks.removedTrees.push(String(path));
      actual.rmSync(path, options);
    },
    lstatSync: (path: import("node:fs").PathLike, options?: import("node:fs").StatSyncOptions) =>
      actual.lstatSync(hooks.lstatAs && String(path) === hooks.lstatAs.from ? hooks.lstatAs.to : path, options),
  };
});
import { PROMPT_MS, withFifo } from "../fifo.fixture";
import { fakeCipher } from "./fixtures/cipher";
import { AuthStorage, StorageError } from "./storage";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "doan-auth-faults-")); });
afterEach(() => { hooks.shortWrite = false; hooks.lstatAs = null; rmSync(root, { recursive: true, force: true }); hooks.removedTrees = []; });
const strays = (dir: string) => readdirSync(dir).filter(name => name.startsWith(".doan-") || name.endsWith(".tmp") || name.endsWith(".aside") || name.endsWith(".probe"));

describe("a short write", () => {
  it("never replaces a Doan-owned setting with part of its text, and leaves no temporary file", () => {
    const storage = new AuthStorage(root, fakeCipher());
    const path = join(storage.profileDir("copilot"), ".copilot/settings.json"); mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "old");
    hooks.shortWrite = true;
    expect(() => storage.writeSetting("copilot", ".copilot/settings.json", '{"doan":1}\n')).toThrow(expect.objectContaining({ code: "write_failed" }));
    expect(readFileSync(path, "utf8")).toBe("old");
    expect(strays(dirname(path))).toEqual([]);
  });
  it("never publishes part of a merged setting, and leaves no staged file", () => {
    const storage = new AuthStorage(root, fakeCipher());
    const dir = storage.profileDir("claude"), path = join(dir, "settings.json");
    writeFileSync(path, "{}");
    hooks.shortWrite = true;
    expect(() => storage.writeSetting("claude", "settings.json", () => '{"model":"kept","rules":1}')).toThrow(StorageError);
    expect(readFileSync(path, "utf8")).toBe("{}");
    expect(strays(dir)).toEqual([]);
  });
});

describe("a merged setting swapped for a FIFO after its lstat", () => {
  it("is left alone without blocking main", async () => {
    const storage = new AuthStorage(root, fakeCipher());
    const dir = storage.profileDir("claude"), path = join(dir, "settings.json"), plain = join(root, "plain.json");
    writeFileSync(plain, "{}");
    hooks.lstatAs = { from: path, to: plain };
    let called = false;
    const main = await withFifo(path, () => { try { storage.writeSetting("claude", "settings.json", () => { called = true; return '{"rules":1}'; }); return null; } catch (error) { return error; } });
    hooks.lstatAs = null;
    expect(main.ms).toBeLessThan(PROMPT_MS);
    expect(main.value).toBeNull();
    expect(called).toBe(false);
    expect(lstatSync(path).isFIFO()).toBe(true);
  });
});

// A fenced agent can keep swapping links into a folder it planted while Doan removes it; a recursive removal that walks
// the profile path could follow one out of the profile.
describe("a folder planted at a Doan-written path", () => {
  it("is moved out of the profile before its tree is removed, and leaves nothing behind", async () => {
    const storage = new AuthStorage(root, fakeCipher());
    const profile = storage.profileDir("copilot"), settings = join(profile, ".copilot/settings.json"), vaultFile = join(profile, ".copilot/config.json");
    const plant = (path: string) => { mkdirSync(join(path, "nested"), { recursive: true }); writeFileSync(join(path, "nested/x"), "x"); };
    plant(settings);
    storage.writeSetting("copilot", ".copilot/settings.json", '{"doan":1}\n');
    await storage.saveVault("copilot", { ".copilot/config.json": Buffer.from("{}") });
    plant(vaultFile);
    await storage.materialize("copilot", [".copilot/config.json"]);
    rmSync(vaultFile); plant(vaultFile);
    storage.scrub("copilot", [".copilot/config.json"]);
    expect(readFileSync(settings, "utf8")).toBe('{"doan":1}\n');
    expect(hooks.removedTrees).toHaveLength(3);
    for (const tree of hooks.removedTrees) expect(tree.startsWith(`${profile}/`)).toBe(false);
    expect(readdirSync(root).filter(name => name.startsWith("."))).toEqual([]);
  });
  it("is moved out of the profile at a keychain provider's plaintext path too, and a file there is reported", () => {
    const storage = new AuthStorage(root, fakeCipher());
    const profile = storage.profileDir("claude"), plaintext = join(profile, ".credentials.json");
    mkdirSync(join(plaintext, "nested"), { recursive: true }); writeFileSync(join(plaintext, "nested/x"), "x");
    expect(storage.removePlaintext("claude", [".credentials.json"])).toBe(false);
    expect(existsSync(plaintext)).toBe(false);
    expect(hooks.removedTrees).toHaveLength(1);
    expect(hooks.removedTrees[0]!.startsWith(`${profile}/`)).toBe(false);
    writeFileSync(plaintext, "{}");
    expect(storage.removePlaintext("claude", [".credentials.json"])).toBe(true);
    expect(existsSync(plaintext)).toBe(false);
    expect(readdirSync(root).filter(name => name.startsWith("."))).toEqual([]);
  });
});
