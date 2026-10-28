import { randomUUID } from "node:crypto";
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, writeSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parseAuthMetadata, serializeAuthMetadata } from "./metadata";
import type { AuthMetadata, Provider } from "./types";

// Electron safeStorage in the app; an OS-keyed cipher is the only thing allowed to touch credential bytes at rest.
export interface Cipher { available(): boolean; encrypt(text: string): Buffer; decrypt(data: Buffer): string }
export type StorageCode = "key_unavailable" | "unreadable" | "write_failed" | "delete_failed";
export class StorageError extends Error {
  constructor(readonly code: StorageCode, detail?: string) { super(detail ? `${code}: ${detail}` : code); }
}
export type VaultFiles = Record<string, Buffer>;
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
function absent(error: unknown): boolean { return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "ENOENT"; }

// Layout under <userData>/agent-auth: metadata.json, vault/<provider>.bin, profiles/<provider>/.
export class AuthStorage {
  constructor(readonly root: string, private readonly cipher: Cipher) {}
  profileDir(provider: Provider): string { const dir = join(this.root, "profiles", provider); mkdirSync(dir, { recursive: true, mode: 0o700 }); return dir; }
  readMetadata(): AuthMetadata {
    let text: string;
    try { text = readFileSync(join(this.root, "metadata.json"), "utf8"); }
    catch (error) { if (absent(error)) return { v: 1, accounts: [] }; throw new StorageError("unreadable", message(error)); }
    const read = parseAuthMetadata(text);
    // Reading damage as "no accounts" would let the next save drop every other provider's connection.
    if (!read.ok) throw new StorageError("unreadable", read.code);
    return read.metadata;
  }
  writeMetadata(metadata: AuthMetadata): void { this.replace(join(this.root, "metadata.json"), Buffer.from(serializeAuthMetadata(metadata))); }
  saveVault(provider: Provider, files: VaultFiles): void {
    const plain = JSON.stringify({ v: 1, files: Object.fromEntries(Object.entries(files).map(([rel, bytes]) => [rel, bytes.toString("base64")])) });
    let sealed: Buffer;
    try { if (!this.cipher.available()) throw new Error("OS encryption is unavailable"); sealed = this.cipher.encrypt(plain); }
    catch (error) { throw new StorageError("key_unavailable", message(error)); }
    this.replace(this.vaultPath(provider), sealed);
  }
  loadVault(provider: Provider): VaultFiles | null {
    let sealed: Buffer;
    try { sealed = readFileSync(this.vaultPath(provider)); }
    catch (error) { if (absent(error)) return null; throw new StorageError("unreadable", message(error)); }
    try {
      if (!this.cipher.available()) throw new Error("OS encryption is unavailable");
      const doc = JSON.parse(this.cipher.decrypt(sealed));
      if (doc?.v !== 1 || typeof doc.files !== "object" || doc.files === null) throw new Error("unknown vault format");
      return Object.fromEntries(Object.entries(doc.files).map(([rel, text]) => {
        if (typeof text !== "string") throw new Error("invalid vault entry");
        return [rel, Buffer.from(text, "base64")];
      }));
    } catch (error) { throw new StorageError("unreadable", message(error)); }
  }
  removeVault(provider: Provider): void { this.remove(this.vaultPath(provider)); }
  // Writes the vault's copy of each listed file into the profile for a provider process; absent entries stay absent.
  materialize(provider: Provider, rels: readonly string[]): void {
    const files = this.loadVault(provider) ?? {};
    for (const rel of rels) {
      const path = this.working(provider, rel);
      if (files[rel]) this.replace(path, files[rel]); else this.remove(path);
    }
  }
  // Returns whether the provider's copy differed from the vault (a refresh, a new login or a logout).
  absorb(provider: Provider, rels: readonly string[]): boolean {
    const current: VaultFiles = {};
    for (const rel of rels) {
      try { current[rel] = readFileSync(this.working(provider, rel)); }
      catch (error) { if (!absent(error)) throw new StorageError("unreadable", message(error)); }
    }
    const stored = this.loadVault(provider);
    const same = stored !== null && Object.keys(stored).length === Object.keys(current).length && Object.entries(current).every(([rel, bytes]) => stored[rel]?.equals(bytes));
    if (same) return false;
    this.saveVault(provider, current);
    return true;
  }
  leftovers(provider: Provider, rels: readonly string[]): boolean { return this.workingPaths(provider, rels).length > 0; }
  scrub(provider: Provider, rels: readonly string[]): void { for (const path of this.workingPaths(provider, rels)) this.remove(path); }
  private vaultPath(provider: Provider): string { return join(this.root, "vault", `${provider}.bin`); }
  private working(provider: Provider, rel: string): string {
    const base = this.profileDir(provider), path = join(base, rel);
    // Never follow a link out of the profile: the provider or a stale run may have replaced a parent.
    for (let dir = dirname(path); dir.length > base.length; dir = dirname(dir)) {
      try { if (lstatSync(dir).isSymbolicLink()) throw new StorageError("write_failed", `symlinked profile path ${rel}`); }
      catch (error) { if (error instanceof StorageError) throw error; if (!absent(error)) throw new StorageError("write_failed", message(error)); }
    }
    return path;
  }
  // The files themselves plus temporary siblings an interrupted write may have left.
  private workingPaths(provider: Provider, rels: readonly string[]): string[] {
    const found: string[] = [];
    for (const rel of rels) {
      const path = this.working(provider, rel);
      let names: string[];
      try { names = readdirSync(dirname(path)); } catch (error) { if (absent(error)) continue; throw new StorageError("unreadable", message(error)); }
      for (const name of names) if (name === basename(path) || (name.startsWith(`${basename(path)}.`) && name.endsWith(".tmp"))) found.push(join(dirname(path), name));
    }
    return found;
  }
  private replace(path: string, bytes: Buffer): void {
    const temp = `${path}.${randomUUID()}.tmp`;
    try {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      const fd = openSync(temp, "wx", 0o600);
      try { writeSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
      renameSync(temp, path);
    } catch (error) {
      try { rmSync(temp, { force: true }); } catch { /* The write already failed; a stray temp file is scrubbed with leftovers. */ }
      throw new StorageError("write_failed", message(error));
    }
  }
  private remove(path: string): void {
    try { rmSync(path); } catch (error) { if (!absent(error)) throw new StorageError("delete_failed", message(error)); }
  }
}
