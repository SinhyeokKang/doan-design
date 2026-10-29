import { randomUUID } from "node:crypto";
import { accessSync, chmodSync, closeSync, constants, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, writeSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parseAuthMetadata, serializeAuthMetadata, validAuthId } from "./metadata";
import { validProvider, type AuthMetadata, type Provider } from "./types";

// Electron safeStorage in the app; an OS-keyed cipher is the only thing allowed to touch credential bytes at rest.
export interface Cipher { available(): Promise<boolean>; encrypt(text: string): Promise<Buffer>; decrypt(data: Buffer): Promise<string> }
export type StorageCode = "key_unavailable" | "unreadable" | "write_failed" | "delete_failed";
export class StorageError extends Error {
  constructor(readonly code: StorageCode, detail?: string) { super(detail ? `${code}: ${detail}` : code); }
}
export type VaultFiles = Record<string, Buffer>;
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
function absent(error: unknown): boolean { return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "ENOENT"; }

// Layout under <userData>/agent-auth: metadata.json, cleanup.json, vault/<provider>.bin, profiles/<profile>/. A profile
// is the provider's name, or <provider>-<id> for a replacement staged apart from the stored login (Codex, D22).
export interface CleanupRecord { provider: Provider; profile: string }
export class AuthStorage {
  constructor(readonly root: string, private readonly cipher: Cipher) {}
  profileDir(provider: Provider, profile: string = provider): string {
    if (profile !== provider && !(profile.startsWith(`${provider}-`) && validAuthId(profile))) throw new StorageError("write_failed", "invalid profile");
    const dir = join(this.root, "profiles", profile); mkdirSync(dir, { recursive: true, mode: 0o700 }); return dir;
  }
  removeProfile(provider: Provider, profile: string): void {
    try { rmSync(this.profileDir(provider, profile), { recursive: true, force: true }); } catch (error) { throw new StorageError("delete_failed", message(error)); }
  }
  // Profiles that may still hold a login no stored connection owns: a staged replacement before it commits or after
  // its cleanup failed, and a replaced profile until its logout succeeds. Damage is never read as "nothing pending".
  pendingCleanup(): CleanupRecord[] {
    let text: string;
    try { text = readFileSync(join(this.root, "cleanup.json"), "utf8"); }
    catch (error) { if (absent(error)) return []; throw new StorageError("unreadable", message(error)); }
    let doc: unknown;
    try { doc = JSON.parse(text); } catch { throw new StorageError("unreadable", "cleanup.json is not JSON"); }
    const profiles = typeof doc === "object" && doc !== null && (doc as { v?: unknown }).v === 1 ? (doc as { profiles?: unknown }).profiles : null;
    if (!Array.isArray(profiles) || !profiles.every(r => typeof r === "object" && r !== null && Object.keys(r).length === 2 && validProvider(r.provider) &&
      typeof r.profile === "string" && (r.profile === r.provider || (r.profile.startsWith(`${r.provider}-`) && validAuthId(r.profile))))) throw new StorageError("unreadable", "invalid cleanup.json");
    return profiles.map(r => ({ provider: r.provider, profile: r.profile }));
  }
  markCleanup(provider: Provider, profile: string): void {
    const records = this.pendingCleanup();
    if (!records.some(r => r.profile === profile)) this.writeCleanup([...records, { provider, profile }]);
  }
  clearCleanup(profile: string): void {
    const records = this.pendingCleanup();
    if (records.some(r => r.profile === profile)) this.writeCleanup(records.filter(r => r.profile !== profile));
  }
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
  async saveVault(provider: Provider, files: VaultFiles): Promise<void> { this.replace(this.vaultPath(provider), await this.sealFiles(files)); }
  // The working copy sealed as a vault image but not stored: a sign-in stores it only at its commit point, so a
  // cancelled or failed replacement never reaches the vault the stored connection still uses.
  async seal(provider: Provider, rels: readonly string[]): Promise<Buffer> { return this.sealFiles(this.collect(provider, rels)); }
  // The stored image as it is on disk, or null; a sign-in puts it back when its metadata write fails.
  sealedVault(provider: Provider): Buffer | null {
    try { return readFileSync(this.vaultPath(provider)); }
    catch (error) { if (absent(error)) return null; throw new StorageError("unreadable", message(error)); }
  }
  storeSealed(provider: Provider, sealed: Buffer | null): void { if (sealed) this.replace(this.vaultPath(provider), sealed); else this.remove(this.vaultPath(provider)); }
  async loadVault(provider: Provider): Promise<VaultFiles | null> {
    let sealed: Buffer;
    try { sealed = readFileSync(this.vaultPath(provider)); }
    catch (error) { if (absent(error)) return null; throw new StorageError("unreadable", message(error)); }
    try {
      if (!await this.cipher.available()) throw new Error("OS encryption is unavailable");
      const text = await this.cipher.decrypt(sealed);
      let doc;
      // A parse error quotes its input, and decrypted bytes may be a credential.
      try { doc = JSON.parse(text); } catch { throw new Error("vault is not a JSON document"); }
      if (doc?.v !== 1 || typeof doc.files !== "object" || doc.files === null) throw new Error("unknown vault format");
      return Object.fromEntries(Object.entries(doc.files).map(([rel, text]) => {
        if (typeof text !== "string") throw new Error("invalid vault entry");
        return [rel, Buffer.from(text, "base64")];
      }));
    } catch (error) { throw new StorageError("unreadable", message(error)); }
  }
  removeVault(provider: Provider): void { this.remove(this.vaultPath(provider)); }
  // Writes the vault's copy of each listed file into the profile for a provider process; absent entries stay absent.
  async materialize(provider: Provider, rels: readonly string[]): Promise<void> {
    const files = await this.loadVault(provider) ?? {};
    for (const rel of rels) {
      const path = this.working(provider, rel);
      if (files[rel]) this.replace(path, files[rel]); else this.remove(path);
    }
  }
  // Returns whether the provider's copy differed from the vault (a refresh, a new login or a logout).
  async absorb(provider: Provider, rels: readonly string[]): Promise<boolean> {
    const current = this.collect(provider, rels);
    const stored = await this.loadVault(provider);
    const same = stored !== null && Object.keys(stored).length === Object.keys(current).length && Object.entries(current).every(([rel, bytes]) => stored[rel]?.equals(bytes));
    if (same) return false;
    await this.saveVault(provider, current);
    return true;
  }
  // A non-secret executable doan owns at the auth root, rewritten when its text or mode drifted; returns its path.
  ownedScript(name: string, text: string): string {
    const path = join(this.root, name);
    let current: string | null = null;
    try { current = readFileSync(path, "utf8"); } catch (error) { if (!absent(error)) throw new StorageError("write_failed", message(error)); }
    if (current !== text) this.replace(path, Buffer.from(text));
    try { chmodSync(path, 0o700); accessSync(path, constants.X_OK); } catch (error) { throw new StorageError("write_failed", message(error)); }
    return path;
  }
  writeSetting(provider: Provider, rel: string, text: string, profile: string = provider): void {
    const path = this.working(provider, rel, profile);
    try { if (readFileSync(path, "utf8") === text) return; } catch (error) { if (!absent(error)) throw new StorageError("unreadable", message(error)); }
    this.replace(path, Buffer.from(text));
  }
  hasWorkingCopy(provider: Provider, rels: readonly string[]): boolean {
    return rels.some(rel => {
      try { lstatSync(this.working(provider, rel)); return true; }
      catch (error) { if (error instanceof StorageError) throw error; if (absent(error)) return false; throw new StorageError("unreadable", message(error)); }
    });
  }
  scrub(provider: Provider, rels: readonly string[]): void { for (const path of this.workingPaths(provider, rels)) this.remove(path); }
  private collect(provider: Provider, rels: readonly string[]): VaultFiles {
    const current: VaultFiles = {};
    for (const rel of rels) {
      try {
        const path = this.working(provider, rel);
        // A link would let a provider process pull an arbitrary file into the vault.
        if (!lstatSync(path).isFile()) throw new StorageError("unreadable", `${rel} is not a regular file`);
        current[rel] = readFileSync(path);
      }
      catch (error) { if (error instanceof StorageError) throw error; if (!absent(error)) throw new StorageError("unreadable", message(error)); }
    }
    return current;
  }
  private async sealFiles(files: VaultFiles): Promise<Buffer> {
    const plain = JSON.stringify({ v: 1, files: Object.fromEntries(Object.entries(files).map(([rel, bytes]) => [rel, bytes.toString("base64")])) });
    try { if (!await this.cipher.available()) throw new Error("OS encryption is unavailable"); return await this.cipher.encrypt(plain); }
    catch (error) { throw new StorageError("key_unavailable", message(error)); }
  }
  private writeCleanup(profiles: CleanupRecord[]): void {
    if (profiles.length) this.replace(join(this.root, "cleanup.json"), Buffer.from(JSON.stringify({ v: 1, profiles }) + "\n"));
    else this.remove(join(this.root, "cleanup.json"));
  }
  private vaultPath(provider: Provider): string { return join(this.root, "vault", `${provider}.bin`); }
  private working(provider: Provider, rel: string, profile: string = provider): string {
    const base = this.profileDir(provider, profile), path = join(base, rel);
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
