import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { OnboardingChange, OnboardingOperationErrorCode } from "../../formats/types";
import { gitChildren, hasGitEntry } from "../addProjects";
import type { LsTarget } from "../cli";
import type { FolderState } from "../folderState";
import type { ProjectInitResult } from "../shell";
import { openDecision } from "../view";
import { runClone, type CloneRequest, type CloneResult } from "./clone";
import type { RemoteRead } from "./gitConfig";
import { findCandidates, folderMatch, type GitHubRepository } from "./repository";

// Project inspection, selection and confirmation for onboarding (buzz-onboarding design '로컬 선택·초기화 연결').
// Only the CLI decides what a doan repo is; remotes come from .git/config, never from running git.

export interface ProjectDeps {
  ls(target: LsTarget): Promise<FolderState>;
  registered(): readonly string[];
  // Registers through Add Project's flow and answers the stored root, or null when it did not store one.
  add(path: string): Promise<string | null>;
  initialize(root: string): Promise<ProjectInitResult>;
  remotes(root: string): RemoteRead;
}
export interface Candidate { path: string; changes: OnboardingChange[] }
export type ProjectOutcome = { ok: true; root: string } | { ok: false; code: OnboardingOperationErrorCode };

const MERGE_LINE = ".doan/comments/*.jsonl merge=union";
const failed = (code: OnboardingOperationErrorCode): ProjectOutcome => ({ ok: false, code });

export async function canonicalFolder(path: string): Promise<string | null> {
  try { const real = await realpath(path); return (await stat(real)).isDirectory() ? real : null; } catch { return null; }
}
// The destination is the final clone folder: it must not exist (not even as a dangling link) and its parent must.
export async function destinationState(path: string): Promise<"absent" | "exists" | "no_parent"> {
  try { await lstat(path); return "exists"; } catch { /* absent */ }
  return await canonicalFolder(dirname(path)) === null ? "no_parent" : "absent";
}

// A clone inside a set-up project would be read as that project (the CLI walks up from a folder), so it could never
// be registered as its own.
export async function cloneDestination(path: string, deps: ProjectDeps): Promise<"absent" | "exists" | "no_parent" | "inside_project"> {
  const state = await destinationState(path);
  if (state !== "absent") return state;
  return (await deps.ls({ cwd: dirname(path) })).kind === "list" ? "inside_project" : "absent";
}

// What `doan init` would create here, read the way init reads it; a folder with any config gets nothing.
export async function plannedChanges(root: string, state: FolderState): Promise<OnboardingChange[]> {
  if (state.kind !== "uninitialized") return [];
  const changes: OnboardingChange[] = [];
  try { await lstat(join(root, ".doan/canvases")); } catch { changes.push(".doan/canvases/"); }
  const attributes = await readFile(join(root, ".gitattributes"), "utf8").catch(() => "");
  if (!attributes.split("\n").some(line => line.replace(/\r$/, "") === MERGE_LINE)) changes.push(".gitattributes");
  changes.push(".doan/config.json");
  return changes.sort();
}

async function candidate(path: string, deps: ProjectDeps): Promise<Candidate | null> {
  const state = await deps.ls({ repo: path });
  if (state.kind === "list") return { path: state.root, changes: [] };
  if (state.kind === "cliError") return null;
  return { path, changes: await plannedChanges(path, state) };
}

// A picked folder: its repo, the repos directly inside it (one is chosen, the parent is never registered), or the
// folder itself to be set up with the user's explicit initialize.
export async function inspectPath(real: string, deps: ProjectDeps): Promise<{ ok: true; candidates: Candidate[] } | { ok: false; code: OnboardingOperationErrorCode }> {
  const state = await deps.ls({ cwd: real });
  if (state.kind === "list") return { ok: true, candidates: [{ path: state.root, changes: [] }] };
  if (state.kind !== "uninitialized") {
    const decision = openDecision(state, real, await deps.ls({ repo: real }));
    return "store" in decision ? { ok: true, candidates: [{ path: decision.store, changes: [] }] } : { ok: false, code: "project_unavailable" };
  }
  const git = await hasGitEntry(real);
  if (git === null) return { ok: false, code: "project_unavailable" };
  const children = git ? [] : await gitChildren(real);
  // Not knowing must not read as "holds no repos": that would offer to set up the parent.
  if (children === null) return { ok: false, code: "project_unavailable" };
  if (children.length === 0) return { ok: true, candidates: [{ path: real, changes: await plannedChanges(real, state) }] };
  const found: Candidate[] = [];
  for (const child of children) {
    const item = await candidate(child, deps);
    if (item && !found.some(other => other.path === item.path)) found.push(item);
  }
  return found.length === 0 ? { ok: false, code: "project_unavailable" } : { ok: true, candidates: found };
}

// Registered projects whose configured remotes name the repository; a config that cannot be read is no candidate
// and no mismatch either.
export async function inspectUrl(repo: GitHubRepository, deps: ProjectDeps): Promise<Candidate[]> {
  const found = findCandidates(repo, deps.registered().map(root => ({ root, remotes: deps.remotes(root) })));
  const candidates: Candidate[] = [];
  for (const root of found.roots) {
    const item = await candidate(root, deps);
    if (item && !candidates.some(other => other.path === item.path)) candidates.push(item);
  }
  return candidates;
}

// Registers at selection, then sets up only what the user asked for; a broken config is never written over.
export async function selectProject(path: string, initialize: boolean, repo: GitHubRepository | null, deps: ProjectDeps): Promise<ProjectOutcome> {
  if (await canonicalFolder(path) !== path) return failed("project_unavailable");
  if (repo && folderMatch(repo, deps.remotes(path)) === "mismatch") return failed("remote_mismatch");
  return register(path, initialize, deps);
}

async function register(path: string, initialize: boolean, deps: ProjectDeps): Promise<ProjectOutcome> {
  const stored = await deps.add(path);
  if (stored === null) return failed("project_unavailable");
  const state = await deps.ls({ repo: stored });
  if (state.kind === "error") return failed("config_invalid");
  if (state.kind === "cliError") return failed("project_unavailable");
  if (state.kind === "list") return confirmProject(state.root, deps);
  if (!initialize) return failed("project_unavailable");
  const outcome = await deps.initialize(stored);
  switch (outcome.kind) {
    case "success": return confirmProject(stored, deps);
    case "rerooted": return confirmProject(outcome.root, deps);
    case "unavailable": return failed("project_unavailable");
    default: return failed("init_failed");
  }
}

// After a clone the user asked for: the new folder is registered and set up like a selected one.
export async function registerClone(destination: string, deps: ProjectDeps): Promise<ProjectOutcome> {
  const outcome = await register(destination, true, deps);
  // Anything else (an ancestor project made meanwhile) is not the repository that was cloned.
  return outcome.ok && outcome.root !== destination ? failed("project_unavailable") : outcome;
}

export interface CloneDeps extends ProjectDeps {
  // The login shell's git and the environment to run it in, or null when there is no usable git.
  git(): Promise<{ git: string; env: Record<string, string> } | null>;
  run?: (request: CloneRequest) => Promise<CloneResult>;
}
export async function cloneProject(url: string, destination: string, signal: AbortSignal, deps: CloneDeps): Promise<ProjectOutcome | { ok: false; cancelled: true }> {
  const located = await deps.git();
  if (located === null) return failed("git_missing");
  if (signal.aborted) return { ok: false, cancelled: true };
  const result = await (deps.run ?? runClone)({ git: located.git, url, destination, env: located.env, signal });
  if (result.kind === "cancelled") return { ok: false, cancelled: true };
  if (result.kind === "failed") return failed(result.code);
  return registerClone(result.destination, deps);
}

// Read again and found registered; never registers or initializes anything itself.
export async function confirmProject(root: string, deps: ProjectDeps): Promise<ProjectOutcome> {
  if (await canonicalFolder(root) !== root) return failed("project_unavailable");
  const state = await deps.ls({ repo: root });
  if (state.kind === "error") return failed("config_invalid");
  if (state.kind !== "list" || state.root !== root || !deps.registered().includes(root)) return failed("project_unavailable");
  return { ok: true, root };
}
