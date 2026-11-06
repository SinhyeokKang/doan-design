import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { OnboardingChange, OnboardingOperationErrorCode, OnboardingStorage } from "../../formats/types";
import { gitChildren, hasGitEntry } from "../addProjects";
import type { LsTarget } from "../cli";
import type { FolderState } from "../folderState";
import type { ProjectInitResult } from "../shell";
import { EXCLUDE_LABEL } from "../storage";
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
  // storage "local": `init --storage local`; null runs plain init, which follows the root's current mode.
  initialize(root: string, storage: "local" | null): Promise<ProjectInitResult>;
  remotes(root: string): RemoteRead;
  // Another listed worktree of this folder's Doan root keeps its files out of Git (storage.ts projectKeepsLocal).
  keepsLocal(path: string): boolean;
  // `doan config --storage local` for a set-up root: success, or the CLI's error code.
  keepLocal(root: string): Promise<{ ok: true } | { ok: false; code: string }>;
}
// storage: "local" when the folder is set up that way or its setup is planned that way (app-socket v2 inspection);
// absent means repo. The adder decides whether a reply may show it.
export interface Candidate { path: string; changes: OnboardingChange[]; storage?: "local" }
// leftovers: directories the clone made and could not remove (cleanup_failed only).
export type ProjectOutcome = { ok: true; root: string } | { ok: false; code: OnboardingOperationErrorCode; leftovers?: string[] };

// The lines `doan init` adds to .gitattributes (cli/internal/cli/init.go); it writes the file while either is missing.
const ATTRIBUTE_LINES = [".doan/comments/*.jsonl merge=union", ".doan/** linguist-documentation"];
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
// The plan keeps the canonical spelling (its parent resolved), which is how the new folder is registered.
export type CloneTarget = { state: "absent"; path: string } | { state: "exists" | "no_parent" | "inside_project" };
export async function cloneDestination(path: string, deps: ProjectDeps): Promise<CloneTarget> {
  const state = await destinationState(path);
  if (state !== "absent") return { state };
  const parent = await canonicalFolder(dirname(path));
  if (parent === null) return { state: "no_parent" };
  return (await deps.ls({ cwd: parent })).kind === "list" ? { state: "inside_project" } : { state: "absent", path: join(parent, basename(path)) };
}

// How a setup would keep the Doan files: "repo" commits them; "local" adds the exclude entry instead of the
// .gitattributes lines; "kept" is a folder whose project already keeps them out of Git, so plain init follows that
// mode and its entry is already there (local-doan-files spec 3).
export type SetupPlan = "repo" | "local" | "kept";

// What `doan init` would create here, read the way init reads it; a folder with any config gets nothing. The exclude
// file sits in the repository's common Git directory, which TS never looks for (§13), so "local" names it by its label.
export async function plannedChanges(root: string, state: FolderState, plan: SetupPlan = "repo"): Promise<OnboardingChange[]> {
  if (state.kind !== "uninitialized") return [];
  const changes: OnboardingChange[] = [];
  try { await lstat(join(root, ".doan/canvases")); } catch { changes.push(".doan/canvases/"); }
  if (plan === "repo") {
    const attributes = await readFile(join(root, ".gitattributes"), "utf8").catch(() => "");
    const present = attributes.split("\n").map(line => line.replace(/\r$/, ""));
    if (ATTRIBUTE_LINES.some(line => !present.includes(line))) changes.push(".gitattributes");
  }
  if (plan === "local") changes.push(EXCLUDE_LABEL);
  changes.push(".doan/config.json");
  return changes.sort();
}

// The candidate of a folder that may still need setup, planned for the requested mode unless its project already
// decided it.
async function planned(path: string, state: FolderState, storage: OnboardingStorage, deps: ProjectDeps): Promise<Candidate> {
  const plan: SetupPlan = deps.keepsLocal(path) ? "kept" : storage;
  return { path, changes: await plannedChanges(path, state, plan), ...(plan === "repo" ? {} : { storage: "local" as const }) };
}
const listed = (state: Extract<FolderState, { kind: "list" }>): Candidate => ({ path: state.root, changes: [], ...(state.storage === "local" ? { storage: "local" as const } : {}) });

async function candidate(path: string, deps: ProjectDeps, storage: OnboardingStorage): Promise<Candidate | null> {
  const state = await deps.ls({ repo: path });
  if (state.kind === "list") return listed(state);
  if (state.kind === "cliError") return null;
  return planned(path, state, storage, deps);
}

// A picked folder: its repo, the repos directly inside it (one is chosen, the parent is never registered), or the
// folder itself to be set up with the user's explicit initialize.
// Picked for a GitHub URL, only folders that may be that repository stay (spec: a folder found from a URL is
// connected only after its remote is checked); a config that cannot be read is no mismatch.
export async function inspectPath(real: string, deps: ProjectDeps, repo: GitHubRepository | null = null, storage: OnboardingStorage = "repo"): Promise<{ ok: true; candidates: Candidate[] } | { ok: false; code: OnboardingOperationErrorCode }> {
  const found = await inspectFolder(real, deps, storage);
  if (!found.ok || repo === null) return found;
  const candidates = found.candidates.filter(c => folderMatch(repo, deps.remotes(c.path)) !== "mismatch");
  return candidates.length === 0 ? { ok: false, code: "remote_mismatch" } : { ok: true, candidates };
}

async function inspectFolder(real: string, deps: ProjectDeps, storage: OnboardingStorage): Promise<{ ok: true; candidates: Candidate[] } | { ok: false; code: OnboardingOperationErrorCode }> {
  const state = await deps.ls({ cwd: real });
  if (state.kind === "list") return { ok: true, candidates: [listed(state)] };
  if (state.kind !== "uninitialized") {
    const decision = openDecision(state, real, await deps.ls({ repo: real }));
    return "store" in decision ? { ok: true, candidates: [{ path: decision.store, changes: [] }] } : { ok: false, code: "project_unavailable" };
  }
  const git = await hasGitEntry(real);
  if (git === null) return { ok: false, code: "project_unavailable" };
  const children = git ? [] : await gitChildren(real);
  // Not knowing must not read as "holds no repos": that would offer to set up the parent.
  if (children === null) return { ok: false, code: "project_unavailable" };
  if (children.length === 0) return { ok: true, candidates: [await planned(real, state, storage, deps)] };
  const found: Candidate[] = [];
  for (const child of children) {
    const item = await candidate(child, deps, storage);
    if (item && !found.some(other => other.path === item.path)) found.push(item);
  }
  return found.length === 0 ? { ok: false, code: "project_unavailable" } : { ok: true, candidates: found };
}

// Registered projects whose configured remotes name the repository; a config that cannot be read is no candidate
// and no mismatch either.
export async function inspectUrl(repo: GitHubRepository, deps: ProjectDeps, storage: OnboardingStorage = "repo"): Promise<Candidate[]> {
  const found = findCandidates(repo, deps.registered().map(root => ({ root, remotes: deps.remotes(root) })));
  const candidates: Candidate[] = [];
  for (const root of found.roots) {
    const item = await candidate(root, deps, storage);
    if (item && !candidates.some(other => other.path === item.path)) candidates.push(item);
  }
  return candidates;
}

// Registers at selection, then sets up only what the user asked for; a broken config is never written over.
// storage "local": the plan named the exclude entry, so init keeps the files out of Git; null runs plain init.
export async function selectProject(path: string, initialize: boolean, repo: GitHubRepository | null, deps: ProjectDeps, storage: "local" | null = null): Promise<ProjectOutcome> {
  if (await canonicalFolder(path) !== path) return failed("project_unavailable");
  if (repo && folderMatch(repo, deps.remotes(path)) === "mismatch") return failed("remote_mismatch");
  return register(path, initialize, deps, storage);
}

// A refused setup, by the CLI's literal code (local-doan-files orch decision 9). Plain init in a project already out of
// Git can fail on the exclude file too, so the codes are read whatever was asked.
function setupFailure(code: string): OnboardingOperationErrorCode {
  return code === "local_not_git" || code === "local_exclude_failed" ? code : "init_failed";
}

// keepChosen: the folder is a clone made for this choice, so a repository that brings its own setup still gets the
// chosen Keep out of Git. A folder picked as it is never has its project's mode changed (spec decision 6).
async function register(path: string, initialize: boolean, deps: ProjectDeps, storage: "local" | null, keepChosen = false): Promise<ProjectOutcome> {
  const stored = await deps.add(path);
  if (stored === null) return failed("project_unavailable");
  const state = await deps.ls({ repo: stored });
  if (state.kind === "error") return failed("config_invalid");
  if (state.kind === "cliError") return failed("project_unavailable");
  if (state.kind === "list") {
    if (keepChosen && storage === "local" && state.storage !== "local") {
      const kept = await deps.keepLocal(state.root);
      // The clone stays registered; only its storage choice failed.
      if (!kept.ok) return failed(kept.code === "local_not_git" ? "local_not_git" : "local_exclude_failed");
    }
    return confirmProject(state.root, deps);
  }
  if (!initialize) return failed("project_unavailable");
  const outcome = await deps.initialize(stored, storage);
  switch (outcome.kind) {
    case "success": return confirmProject(stored, deps);
    case "rerooted": return confirmProject(outcome.root, deps);
    case "unavailable": return failed("project_unavailable");
    case "error": return failed(setupFailure(outcome.code));
    default: return failed("init_failed");
  }
}

// After a clone the user asked for: the new folder is registered and set up like a selected one.
export async function registerClone(destination: string, deps: ProjectDeps, storage: "local" | null = null): Promise<ProjectOutcome> {
  const outcome = await register(destination, true, deps, storage, true);
  // Anything else (an ancestor project made meanwhile) is not the repository that was cloned.
  return outcome.ok && outcome.root !== await canonicalFolder(destination) ? failed("project_unavailable") : outcome;
}

export interface CloneDeps extends ProjectDeps {
  // The login shell's git and the environment to run it in, or null when there is no usable git.
  git(): Promise<{ git: string; env: Record<string, string> } | null>;
  run?: (request: CloneRequest) => Promise<CloneResult>;
}
// A recorded leftover counts as removed only when it is confirmed absent; an unreadable path may still be there.
export async function leftoverPresent(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error) { return !(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"); }
}

// After commit the clone is the user's project: registration and setup run without a cancel.
export async function cloneProject(url: string, destination: string, signal: AbortSignal, deps: CloneDeps, commit?: () => boolean, storage: "local" | null = null): Promise<ProjectOutcome | { ok: false; cancelled: true }> {
  const located = await deps.git();
  if (located === null) return failed("git_missing");
  if (signal.aborted) return { ok: false, cancelled: true };
  const result = await (deps.run ?? runClone)({ git: located.git, url, destination, env: located.env, signal, ...(commit ? { commit } : {}) });
  if (result.kind === "cancelled") return { ok: false, cancelled: true };
  if (result.kind === "failed") return result.code === "cleanup_failed" ? { ok: false, code: result.code, leftovers: result.leftovers } : failed(result.code);
  return registerClone(result.destination, deps, storage);
}

// Read again and found registered; never registers or initializes anything itself.
export async function confirmProject(root: string, deps: ProjectDeps): Promise<ProjectOutcome> {
  if (await canonicalFolder(root) !== root) return failed("project_unavailable");
  const state = await deps.ls({ repo: root });
  if (state.kind === "error") return failed("config_invalid");
  if (state.kind !== "list" || state.root !== root || !deps.registered().includes(root)) return failed("project_unavailable");
  return { ok: true, root };
}
