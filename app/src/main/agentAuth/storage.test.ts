import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeCipher } from "./fixtures/cipher";
import { AuthStorage, StorageError } from "./storage";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "doan-auth-storage-")); });
afterEach(() => { chmodTree(root); rmSync(root, { recursive: true, force: true }); });
function chmodTree(path: string): void { try { chmodSync(path, 0o700); for (const name of readdirSync(path)) if (statSync(join(path, name)).isDirectory()) chmodTree(join(path, name)); } catch { /* best effort */ } }
const files = ["config/auth.json", "token"];
function plant(storage: AuthStorage, provider: "cursor", rel: string, text: string): void {
  const path = join(storage.profileDir(provider), rel); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text);
}
const vaultBytes = (storage: AuthStorage) => readFileSync(join(storage.root, "vault", "cursor.bin")).toString("utf8");

describe("auth metadata file", () => {
  it("reads an absent file as no accounts and round-trips through an owner-only file", () => {
    const storage = new AuthStorage(root, fakeCipher());
    expect(storage.readMetadata()).toEqual({ v: 1, accounts: [] });
    const metadata = { v: 1 as const, accounts: [{ provider: "claude" as const, connectionId: "c1", profile: "claude", account: { id: "a", workspace: null } }] };
    storage.writeMetadata(metadata);
    expect(storage.readMetadata()).toEqual(metadata);
    expect(statSync(join(root, "metadata.json")).mode & 0o777).toBe(0o600);
    expect(readdirSync(root).filter(name => name.endsWith(".tmp"))).toEqual([]);
  });
  it("refuses an unreadable file instead of reading it as empty", () => {
    writeFileSync(join(root, "metadata.json"), "{not json");
    expect(() => new AuthStorage(root, fakeCipher()).readMetadata()).toThrow(StorageError);
    writeFileSync(join(root, "metadata.json"), JSON.stringify({ v: 2, accounts: [] }));
    expect(() => new AuthStorage(root, fakeCipher()).readMetadata()).toThrow(StorageError);
  });
});

describe("encrypted vault", () => {
  it("round-trips provider files without writing them in plaintext", () => {
    const storage = new AuthStorage(root, fakeCipher());
    storage.saveVault("cursor", { "config/auth.json": Buffer.from('{"token":"secret-1"}') });
    expect(vaultBytes(storage)).not.toContain("secret-1");
    expect(statSync(join(root, "vault", "cursor.bin")).mode & 0o777).toBe(0o600);
    expect(storage.loadVault("cursor")).toEqual({ "config/auth.json": Buffer.from('{"token":"secret-1"}') });
    expect(storage.loadVault("copilot")).toBeNull();
  });
  it("never falls back to plaintext when the OS key is unavailable or encryption fails", () => {
    for (const cipher of [fakeCipher({ available: () => false }), fakeCipher({ encrypt: () => { throw new Error("denied"); } })]) {
      const storage = new AuthStorage(root, cipher);
      expect(() => storage.saveVault("cursor", { token: Buffer.from("secret-2") })).toThrow(expect.objectContaining({ code: "key_unavailable" }));
      expect(existsSync(join(root, "vault", "cursor.bin"))).toBe(false);
      expect(JSON.stringify(readdirSync(root, { recursive: true }))).not.toContain(".tmp");
    }
  });
  it("reports an undecryptable vault without deleting it", () => {
    new AuthStorage(root, fakeCipher()).saveVault("cursor", { token: Buffer.from("secret-3") });
    const other = new AuthStorage(root, fakeCipher({ decrypt: () => { throw new Error("other key"); } }));
    expect(() => other.loadVault("cursor")).toThrow(expect.objectContaining({ code: "unreadable" }));
    expect(existsSync(join(root, "vault", "cursor.bin"))).toBe(true);
  });
  it("reports a failed delete and keeps the vault", () => {
    const storage = new AuthStorage(root, fakeCipher());
    storage.saveVault("cursor", { token: Buffer.from("x") });
    chmodSync(join(root, "vault"), 0o500);
    expect(() => storage.removeVault("cursor")).toThrow(expect.objectContaining({ code: "delete_failed" }));
    chmodSync(join(root, "vault"), 0o700);
    expect(storage.loadVault("cursor")).not.toBeNull();
    storage.removeVault("cursor"); storage.removeVault("cursor");
    expect(storage.loadVault("cursor")).toBeNull();
  });
});

describe("provider file bridge", () => {
  it("materializes owner-only working files and absorbs a runtime refresh before scrubbing", () => {
    const storage = new AuthStorage(root, fakeCipher());
    storage.saveVault("cursor", { "config/auth.json": Buffer.from("v1") });
    storage.materialize("cursor", files);
    const path = join(storage.profileDir("cursor"), "config/auth.json");
    expect(readFileSync(path, "utf8")).toBe("v1");
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(existsSync(join(storage.profileDir("cursor"), "token"))).toBe(false);
    writeFileSync(path, "v2-refreshed"); plant(storage, "cursor", "token", "t2");
    expect(storage.absorb("cursor", files)).toBe(true);
    storage.scrub("cursor", files);
    expect(existsSync(path)).toBe(false);
    expect(storage.loadVault("cursor")).toEqual({ "config/auth.json": Buffer.from("v2-refreshed"), token: Buffer.from("t2") });
    expect(vaultBytes(storage)).not.toContain("v2-refreshed");
  });
  it("leaves the vault alone when the working files did not change", () => {
    const storage = new AuthStorage(root, fakeCipher());
    storage.saveVault("cursor", { token: Buffer.from("same") });
    storage.materialize("cursor", files);
    const before = statSync(join(root, "vault", "cursor.bin")).mtimeMs;
    expect(storage.absorb("cursor", files)).toBe(false);
    expect(statSync(join(root, "vault", "cursor.bin")).mtimeMs).toBe(before);
  });
  it("keeps the previous vault and the working files when encryption fails during absorb", () => {
    let fail = false;
    const storage = new AuthStorage(root, fakeCipher({ encrypt: text => { if (fail) throw new Error("locked"); return fakeCipher().encrypt(text); } }));
    storage.saveVault("cursor", { token: Buffer.from("old") });
    plant(storage, "cursor", "token", "new"); fail = true;
    expect(() => storage.absorb("cursor", files)).toThrow(expect.objectContaining({ code: "key_unavailable" }));
    fail = false;
    expect(storage.loadVault("cursor")).toEqual({ token: Buffer.from("old") });
  });
  it("lists and scrubs plaintext and temporary leftovers, refusing symlinked working paths", () => {
    const storage = new AuthStorage(root, fakeCipher());
    plant(storage, "cursor", "config/auth.json", "left"); plant(storage, "cursor", "config/auth.json.123.tmp", "half");
    expect(storage.leftovers("cursor", files)).toBe(true);
    storage.scrub("cursor", files);
    expect(storage.leftovers("cursor", files)).toBe(false);
    expect(readdirSync(join(storage.profileDir("cursor"), "config"))).toEqual([]);
  });
  it("reports a failed scrub so a sign-out cannot claim the file is gone", () => {
    const storage = new AuthStorage(root, fakeCipher());
    plant(storage, "cursor", "config/auth.json", "left");
    chmodSync(join(storage.profileDir("cursor"), "config"), 0o500);
    expect(() => storage.scrub("cursor", files)).toThrow(expect.objectContaining({ code: "delete_failed" }));
  });
  it("creates owner-only profile directories under the auth root", () => {
    const storage = new AuthStorage(root, fakeCipher());
    expect(storage.profileDir("copilot")).toBe(join(root, "profiles", "copilot"));
    expect(statSync(storage.profileDir("copilot")).mode & 0o777).toBe(0o700);
  });
});
