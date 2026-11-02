import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { accessSync, chmodSync, constants, linkSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { rcFileFor, type SetupItem, type SetupTarget } from "./notice";
import { swapLink, type SwapResult } from "./swap";
import { classifyTarget, decide, installEligibility, mergeClaudeAllow, needsSystemLink, plannedTargets, record, writeFailure, type Observation, type Outcome, type PlannedTarget, type ProviderDir, type Step } from "./plan";

// Agent setup's thin I/O shell (design '배치', '소유 판정'): reads each target right before deciding, writes only
// Doan's own links, and never creates a provider folder.

export type AdminResult = { kind: "ok" } | { kind: "cancelled" } | { kind: "failed"; message: string };
export interface AgentSetupOptions {
  home: string;
  // process.resourcesPath; `current` gets its realpath.
  resources: string;
  isPackaged: boolean;
  // The login shell's PATH; null when the probe failed.
  loginPath: string | null;
  shell: string;
  userData: string;
  // Runs a shell command as an administrator (osascriptAdmin in the app).
  runAdmin: (command: string) => Promise<AdminResult>;
  log?: (message: string) => void;
  systemBin?: string;
}
// `items` is what About shows (aboutNotice); `steps` is what happened to each target, for the log and tests.
export interface AgentSetupResult { home: string; items: SetupItem[]; steps: Step[] }

const CANCELLED_FILE = "agent-setup.json";
// `parent` is the resolved folder's "dev:ino", so a replacement can tell the folder was swapped.
interface Seen extends Observation { stamp: string; parent: string | null }

function errorCode(error: unknown): string { return typeof error === "object" && error !== null && "code" in error ? String(error.code) : "UNKNOWN"; }
function canonical(path: string): string | null { try { return realpathSync.native(path); } catch { return null; } }
function isDirectory(path: string): boolean { try { return statSync(path).isDirectory(); } catch { return false; } }
function kindOf(path: string): Observation["kind"] | { error: string } {
  try { const s = lstatSync(path); return s.isSymbolicLink() ? "symlink" : s.isDirectory() ? "directory" : s.isFile() ? "file" : "other"; }
  catch (error) { const code = errorCode(error); return code === "ENOENT" ? "missing" : { error: code }; }
}
// The nearest ancestor that is not a directory: a file, or a link that is broken, loops or names a file.
function blockedParent(path: string): string | null {
  const parent = dirname(path);
  if (parent === path) return null;
  const ancestor = blockedParent(parent);
  if (ancestor) return ancestor;
  const kind = kindOf(parent);
  if (kind === "symlink") return isDirectory(parent) ? null : parent;
  return kind === "directory" || kind === "missing" ? null : parent;
}
// Missing suffixes keep their names under the nearest existing real directory.
function realDirectory(path: string): string | null {
  if (kindOf(path) === "missing") {
    const parent = dirname(path);
    if (parent === path) return null;
    const real = realDirectory(parent);
    return real === null ? null : join(real, basename(path));
  }
  return isDirectory(path) ? canonical(path) : null;
}
function realTarget(path: string): string | null {
  const parent = realDirectory(dirname(path));
  return parent === null ? null : join(parent, basename(path));
}

function folderId(path: string): string | null {
  try { const s = lstatSync(path); return s.isDirectory() ? `${s.dev}:${s.ino}` : null; } catch { return null; }
}
function observe(target: PlannedTarget): Seen {
  const blocked = blockedParent(target.path);
  if (blocked) return { kind: "missing", blockedParent: blocked, real: null, stamp: `blocked:${blocked}`, parent: null };
  const kind = kindOf(target.path), real = realTarget(target.path), parent = real === null ? null : folderId(dirname(real));
  if (typeof kind !== "string") return { kind: "missing", error: kind.error, real, stamp: `error:${kind.error}`, parent };
  let value: string | null = null, content: string | null = null, stamp = `${real}:${kind}`;
  try {
    if (kind === "symlink") value = readlinkSync(target.path);
    if (kind === "file" && target.file) content = readFileSync(target.path, "utf8");
    // Read through a link to the person's settings only to see whether they added the rules themselves.
    // Only a regular file: reading a link to a FIFO would block launch.
    if (kind === "symlink" && target.target === "claude-allow") { try { if (statSync(target.path).isFile()) content = readFileSync(target.path, "utf8"); } catch { content = null; } }
    if (kind !== "missing") { const s = lstatSync(target.path); stamp += `:${s.dev}:${s.ino}:${s.mtimeMs}:${s.ctimeMs}`; }
  } catch (error) { return { kind: "missing", error: errorCode(error), real, stamp: `error:${errorCode(error)}`, parent }; }
  return { kind, value, content, real, stamp: `${stamp}:${value}:${content}`, parent };
}

// Creates the folders below `root` one at a time, so a provider folder removed mid-run is never recreated.
function ensureDirectory(root: string, dir: string): void {
  if (!statSync(root).isDirectory()) throw Object.assign(new Error(`${root} is not a directory`), { code: "ENOTDIR" });
  let at = root;
  for (const part of relative(root, dir).split("/").filter(Boolean)) {
    at = join(at, part);
    try { mkdirSync(at); } catch (error) { if (errorCode(error) !== "EEXIST") throw error; }
  }
}

type Written = { ok: true } | { ok: false; item?: SetupItem };
// Something else took the target while Doan was writing: name it only if it is now someone else's.
function changed(target: PlannedTarget, home: string): Written {
  const now = observe(target);
  if (now.blockedParent || now.error || classifyTarget(target.target, home, now) !== "foreign") return { ok: false };
  const step = decide(target, now, home, new Map());
  return { ok: false, ...(step.action === "skip" && "item" in step ? { item: step.item } : {}) };
}

function asideName(path: string): string { return join(dirname(path), `.doan-${randomUUID()}.aside`); }
function displaced(target: PlannedTarget, at: string): Written {
  return { ok: false, item: { target: target.target, path: target.path, providers: [...target.providers], reason: "write-failed", cause: "displaced", at, code: "EEXIST" } };
}
function settled(target: PlannedTarget, home: string, result: SwapResult): Written {
  switch (result.kind) {
    case "ok": return { ok: true };
    case "changed": return changed(target, home);
    case "displaced": return displaced(target, result.at);
    case "failed": return { ok: false, item: writeFailure(target, result.code) };
  }
}

// Claude Code writes the same file, so Doan merges into what it read and renames the result over it only if the file
// is still exactly that (swap.ts: re-read right before writing). rename(2) replaces whatever is at the name then, so a
// write landing between that check and the rename is lost; as in swap.ts, that needs a process running as the person.
function mergeSettings(target: PlannedTarget, before: Seen, temporary: string, real: string, home: string): Written {
  const merged = mergeClaudeAllow(before.content ?? null);
  if (before.kind !== "file" || merged.kind !== "write") return changed(target, home);
  writeFileSync(temporary, merged.text, { flag: "wx" });
  chmodSync(temporary, lstatSync(real).mode & 0o777);
  if (observe(target).stamp !== before.stamp) return changed(target, home);
  renameSync(temporary, real);
  return { ok: true };
}

function write(target: PlannedTarget, action: "create" | "replace", before: Seen, home: string): Written {
  const real = before.real;
  if (real === null || real === undefined) return { ok: false, item: writeFailure(target, before.error ?? "UNKNOWN") };
  const temporary = join(dirname(real), `.doan-${randomUUID()}.tmp`);
  try {
    ensureDirectory(target.root, dirname(target.path));
    if (blockedParent(target.path) || realTarget(target.path) !== real) return changed(target, home);
    if (action === "create" && target.file) {
      writeFileSync(temporary, target.want, { flag: "wx", mode: 0o644 });
      if (observe(target).stamp !== before.stamp) return changed(target, home);
      // link(2) publishes the staged regular file exclusively; never link a symlink (macOS follows it).
      linkSync(temporary, real);
    } else if (target.target === "claude-allow") {
      return mergeSettings(target, before, temporary, real, home);
    } else if (action === "create") {
      if (observe(target).stamp !== before.stamp) return changed(target, home);
      // symlink(2) fails on an existing name, so a competitor that wins the race is kept.
      symlinkSync(target.want, real);
    } else {
      if (observe(target).stamp !== before.stamp || before.value == null) return changed(target, home);
      return settled(target, home, swapLink({ lstatSync, readlinkSync, renameSync, symlinkSync, linkSync, unlinkSync },
        { path: real, want: target.want, old: before.value, aside: asideName(real), parent: before.parent }));
    }
    return { ok: true };
  } catch (error) {
    const code = errorCode(error);
    return code === "EEXIST" ? changed(target, home) : { ok: false, item: writeFailure(target, code) };
  } finally { rmSync(temporary, { force: true }); }
}

function quote(value: string): string { return `'${value.replaceAll("'", "'\\''")}'`; }
// When the dialog is needed, /usr/local/bin is root-owned (or absent under a root-owned /usr/local), so no process
// running as the person can create an entry there while it is open. `ln` without -f refuses an existing file or link
// and -h refuses to follow a link; a folder already there was classified foreign and never reaches this command. Only
// SIP-protected system binaries run, with a cleared environment, so nothing the person can replace runs as root.
export function adminCommand(target: Pick<PlannedTarget, "path" | "want">): string {
  const run = "/usr/bin/env -i PATH=/usr/bin:/bin";
  return `${run} /bin/mkdir -p ${quote(dirname(target.path))} && ${run} /bin/ln -s -h ${quote(target.want)} ${quote(target.path)}`;
}

function writableFolder(path: string): boolean {
  try { accessSync(path, constants.W_OK); return statSync(path).isDirectory(); } catch { return false; }
}

function cancelledBefore(userData: string): boolean {
  try { return JSON.parse(readFileSync(join(userData, CANCELLED_FILE), "utf8")).adminCancelled === true; } catch { return false; }
}

// /usr/local/bin/doan is create-only (plan.ts classifyTarget): a writable folder gets the person's own exclusive
// symlink, and only otherwise does Doan ask for administrator rights, once.
async function writeSystem(target: PlannedTarget, before: Seen, options: AgentSetupOptions, home: string, log: (message: string) => void): Promise<Written> {
  if (writableFolder(dirname(target.path))) return write(target, "create", before, home);
  const cancelled: Written = { ok: false, item: { target: target.target, path: target.path, providers: [...target.providers], reason: "admin-cancelled", rcFile: rcFileFor(options.shell) } };
  if (cancelledBefore(options.userData)) return cancelled;
  const result = await options.runAdmin(adminCommand(target));
  if (result.kind === "cancelled") {
    try { writeFileSync(join(options.userData, CANCELLED_FILE), `${JSON.stringify({ adminCancelled: true })}\n`); }
    catch (error) { log(`cannot record the cancelled administrator dialog: ${errorCode(error)}`); }
    return cancelled;
  }
  if (result.kind === "failed") log(`administrator command failed: ${result.message}`);
  const now = observe(target);
  if (now.kind === "symlink" && now.value === target.want) return { ok: true };
  return now.stamp !== before.stamp ? changed(target, home) : { ok: false, item: writeFailure(target, "administrator command failed") };
}

export async function runAgentSetup(options: AgentSetupOptions): Promise<AgentSetupResult> {
  const log = options.log ?? ((message: string) => console.log(`doan: agent setup: ${message}`));
  // Links are built from the canonical HOME, as the eligibility check compares real paths.
  const home = canonical(options.home) ?? options.home, resources = canonical(options.resources) ?? options.resources;
  const bundle = dirname(dirname(resources));
  const eligibility = installEligibility(bundle, home, options.isPackaged);
  if (eligibility !== "eligible") {
    log(`not set up: ${eligibility} (${bundle})`);
    return { home, items: [{ target: "copy", path: bundle, providers: ["claude", "codex", "cursor", "antigravity", "copilot"], reason: "not-eligible", eligibility }], steps: [] };
  }
  const providerDirs = (["claude", "codex", "gemini"] as const satisfies readonly ProviderDir[]).filter(dir => isDirectory(join(home, `.${dir}`)));
  const targets = plannedTargets(home, resources, providerDirs, needsSystemLink(options.loginPath, home), options.systemBin);
  const outcomes = new Map<SetupTarget, Outcome>(), items: SetupItem[] = [], steps: Step[] = [];
  for (const target of targets) {
    const before = observe(target);
    let step = decide(target, before, home, outcomes);
    let written: Written = { ok: step.action !== "skip", ...(step.action === "skip" && "item" in step ? { item: step.item } : {}) };
    if (step.action === "create" || step.action === "replace") {
      written = target.target === "system-cli" ? await writeSystem(target, before, options, home, log) : write(target, step.action, before, home);
      if (!written.ok) step = { target: target.target, path: target.path, ...(written.item ? { action: "skip", item: written.item } : { action: "changed" }) };
    }
    const item = written.ok ? undefined : written.item;
    record(outcomes, target, step, before, written.ok, item);
    if (item) items.push(item);
    steps.push(step);
    log(`${target.path}: ${step.action}${step.action === "skip" ? ` (${"item" in step ? step.item.reason : `after ${step.on}`})` : ""}`);
  }
  return { home, items, steps };
}

function appleScriptString(value: string): string { return `"${value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`; }
// The macOS administrator dialog, as ego lite does. No timeout: the dialog waits for the person.
export function osascriptAdmin(command: string): Promise<AdminResult> {
  return new Promise(resolve => {
    execFile("/usr/bin/osascript", ["-e", `do shell script ${appleScriptString(command)} with administrator privileges`], (error, _stdout, stderr) => {
      if (!error) resolve({ kind: "ok" });
      else if (/\(-128\)/.test(String(stderr))) resolve({ kind: "cancelled" });
      else resolve({ kind: "failed", message: String(stderr).trim() || error.message });
    });
  });
}
