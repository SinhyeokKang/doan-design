import { randomBytes } from "node:crypto";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseConnectorsFile, parsePendingLogouts, patchConnectors, patchPendingLogouts,
  type ConnectorsFile, type ConnectorsPatch, type ConnectorsRead, type PendingLogout,
} from "./files";
import type { McpProvider } from "./presets";

export interface StoreFs {
  readFileSync(path: string): string;
  writeFileSync(path: string, text: string): void;
  renameSync(from: string, to: string): void;
  rmSync(path: string): void;
}
const defaultFs: StoreFs = {
  readFileSync: path => readFileSync(path, "utf8"),
  // Exclusive: a leftover temporary name is never written through.
  writeFileSync: (path, text) => writeFileSync(path, text, { flag: "wx", mode: 0o600 }),
  renameSync: (from, to) => renameSync(from, to),
  rmSync: path => rmSync(path, { force: true }),
};
export type StoreWrite = { ok: true; file: ConnectorsFile } | { ok: false; code: "broken" | "newer" | "invalid" | "write_failed" };

const key = (provider: McpProvider, name: string) => `${provider}\0${name}`;
const missing = (error: unknown) => typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT";

// `<userData>/mcp-connectors.json` and `<userData>/mcp-connectors-pending.json` (mcp-connectors design 'store',
// 'pending'). Both are read from disk at every use and replaced whole (temporary file, then rename); writes are
// synchronous, so two patches never interleave. Neither file is ever read as defaults when it cannot be read, nor
// replaced: the providers keep Doan's registrations and logouts, which an empty file would lose track of.
export class ConnectorStore {
  private readonly fs: StoreFs;
  // Pending logouts that could not be written, or whose removal could not be: they block Connect for this run.
  private readonly memory = new Map<string, PendingLogout>();
  private warned = false;
  constructor(private readonly dir: string, options: { fs?: Partial<StoreFs> } = {}) { this.fs = { ...defaultFs, ...options.fs }; }

  connectors(): ConnectorsRead { return parseConnectorsFile(this.read("mcp-connectors.json")); }

  patch(patch: ConnectorsPatch): StoreWrite {
    const read = this.connectors();
    if (!read.ok) return read;
    const next = patchConnectors(read.file, patch);
    if (!next) return { ok: false, code: "invalid" };
    return this.write("mcp-connectors.json", next) ? { ok: true, file: next } : { ok: false, code: "write_failed" };
  }

  // The file's records and the ones held in memory.
  pending(provider?: McpProvider): PendingLogout[] {
    const all = new Map<string, PendingLogout>();
    const read = this.pendingFile();
    for (const logout of read?.logouts ?? []) all.set(key(logout.provider, logout.name), logout);
    for (const [at, logout] of this.memory) all.set(at, logout);
    return [...all.values()].filter(logout => !provider || logout.provider === provider);
  }
  blocked(provider: McpProvider, name: string): boolean { return this.pending(provider).some(logout => logout.name === name); }

  // false: kept in memory only, so it blocks Connect until the app quits.
  record(entries: PendingLogout[]): boolean {
    const file = this.pendingFile();
    const next = file && patchPendingLogouts(file, { add: entries });
    if (next && this.write("mcp-connectors-pending.json", next)) return true;
    // An invalid record (a name Doan did not make) blocks nothing.
    if (!patchPendingLogouts({ v: 1, logouts: [] }, { add: entries })) return false;
    console.error("doan: pending MCP logouts could not be recorded; Connect stays blocked until Doan quits");
    for (const entry of entries) this.memory.set(key(entry.provider, entry.name), { provider: entry.provider, name: entry.name, url: entry.url });
    return false;
  }

  // false: the record is still on disk, so it keeps blocking for this run; a later Connect retries the logout again.
  clear(provider: McpProvider, name: string): boolean {
    const held = this.memory.get(key(provider, name));
    this.memory.delete(key(provider, name));
    const file = this.pendingFile();
    const recorded = file?.logouts.find(logout => logout.provider === provider && logout.name === name);
    if (!file || !recorded) return true;
    if (this.write("mcp-connectors-pending.json", patchPendingLogouts(file, { remove: { provider, name } })!)) return true;
    this.memory.set(key(provider, name), held ?? recorded);
    return false;
  }

  private pendingFile() {
    const read = parsePendingLogouts(this.read("mcp-connectors-pending.json"));
    if (read.ok) return read.file;
    if (!this.warned) console.error(`doan: mcp-connectors-pending.json is ${read.code === "newer" ? "from a newer Doan" : "unreadable"}; it is left as it is`);
    this.warned = true;
    return null;
  }
  private read(name: string): string | null {
    try { return this.fs.readFileSync(join(this.dir, name)); } catch (error) { return missing(error) ? null : ""; }
  }
  private write(name: string, value: unknown): boolean {
    const file = join(this.dir, name), temp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
    try {
      this.fs.writeFileSync(temp, `${JSON.stringify(value)}\n`);
      this.fs.renameSync(temp, file);
      return true;
    } catch (error) {
      try { this.fs.rmSync(temp); } catch { /* Nothing was written. */ }
      console.error(`doan: cannot save ${name}`, error);
      return false;
    }
  }
}
