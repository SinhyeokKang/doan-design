import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readdir, readFile, readlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const { bounded }: typeof import("./harness") = await import(new URL("./harness.ts", import.meta.url).href);
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
async function tree(path: string): Promise<unknown> {
  try {
    const info = await lstat(path);
    const meta = { mode: info.mode, ino: info.ino, dev: info.dev };
    if (info.isSymbolicLink()) return { ...meta, link: await readlink(path) };
    if (info.isDirectory()) return { ...meta, children: await Promise.all((await readdir(path)).sort().map(async name => [name, await tree(join(path, name))])) };
    return { ...meta, hash: hash(await readFile(path)) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "absent";
    throw error;
  }
}
async function key(path: string, toml: boolean): Promise<string> {
  let bytes: string;
  try { bytes = await readFile(path, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return "absent-file"; throw error; }
  if (!toml) {
    const servers = JSON.parse(bytes).mcpServers;
    return hash(JSON.stringify(servers && Object.hasOwn(servers, "doan") ? { present: true, value: servers.doan } : { present: false }));
  }
  // Parse TOML rather than matching headers: quoted keys and nested tables are valid.
  // Only the selected key's digest leaves the subprocess; no config is logged.
  const result = await promisify(execFile)("python3.12", ["-c", 'import hashlib,json,sys,tomllib\nwith open(sys.argv[1],"rb") as f: servers=tomllib.load(f).get("mcp_servers",{}); v={"present":"doan" in servers,"value":servers.get("doan")}\nprint(hashlib.sha256(json.dumps(v,sort_keys=True,separators=(",",":")).encode()).hexdigest())', path], { timeout: 5_000, killSignal: "SIGKILL" });
  return result.stdout.trim();
}
// Provider credential stores are compared by metadata only; reading them would copy secrets into probe logs.
const AUTH_FILES = [".claude/.credentials.json", ".codex/auth.json", ".cursor/auth.json", ".config/cursor/auth.json", ".copilot/config.json", ".copilot/settings.json",
  ".config/gh/hosts.yml", ".gemini/antigravity-cli", ".gemini/config"];
async function meta(path: string): Promise<unknown> {
  try { const info = await lstat(path); return { size: info.size, mtimeMs: info.mtimeMs, ino: info.ino, mode: info.mode }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return "absent"; throw error; }
}
// Attributes only (no -d): service, account and modification date of provider and doan Keychain items.
async function keychain(): Promise<string> {
  let dump: string;
  try { dump = (await promisify(execFile)("security", ["dump-keychain"], { timeout: 5_000, killSignal: "SIGKILL", maxBuffer: 64 * 1024 * 1024 })).stdout; }
  catch (error) { return `unavailable:${(error as NodeJS.ErrnoException).code ?? "error"}`; }
  const items = dump.split(/^keychain: /m).map(block => [block.match(/"svce"<blob>="([^"]*)"/)?.[1], block.match(/"acct"<blob>="([^"]*)"/)?.[1], block.match(/"mdat"<timedate>=\S+\s+"([^"\\]*)/)?.[1]])
    .filter(([svce]) => svce && /claude|codex|cursor|gemini|antigravity|copilot|gh:|doan/i.test(svce)).map(item => item.join("|")).sort();
  return hash(JSON.stringify(items));
}
async function snapshot(): Promise<Record<string, string>> {
  const home = homedir();
  const result: Record<string, string> = {};
  for (const path of new Set([join(home, ".local/bin/doan"), join(home, ".agents/skills/doan"), join(home, ".claude/skills/doan"),
    ...(process.env.CLAUDE_CONFIG_DIR ? [join(process.env.CLAUDE_CONFIG_DIR, "skills/doan")] : []),
    ...["folders.json", "runtime.json", "onboarding.json", "ui-state.json", "thumbnails", "sessions.jsonl", "conversations", "agent-auth"].map(name => join(home, "Library/Application Support/doan", name))])) result[path] = hash(JSON.stringify(await tree(path)));
  for (const rel of AUTH_FILES) result[`${join(home, rel)}:meta`] = hash(JSON.stringify(await meta(join(home, rel))));
  result["keychain:provider-items"] = await keychain();
  for (const path of new Set([join(home, ".claude.json"), ...(process.env.CLAUDE_CONFIG_DIR ? [join(process.env.CLAUDE_CONFIG_DIR, ".claude.json")] : [])])) result[`${path}:mcpServers.doan`] = await key(path, false);
  for (const path of new Set([join(home, ".codex/config.toml"), ...(process.env.CODEX_HOME ? [join(process.env.CODEX_HOME, "config.toml")] : [])])) result[`${path}:mcp_servers.doan`] = await key(path, true);
  return result;
}
export async function assertRealState(before: Record<string, string>): Promise<void> {
  const after = await realState();
  assert.deepEqual(after, before, "real onboarding state changed");
  for (const path of Object.keys(before)) console.log(`real-state: unchanged ${path}`);
}

export function realState(): Promise<Record<string, string>> {
  return bounded(snapshot(), 10_000, "real-state snapshot");
}
