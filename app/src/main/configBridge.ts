import { randomUUID } from "node:crypto";
import { isAbsolute, join } from "node:path";
import { validateEnvelope } from "../formats/validate";
import type { CliEnv } from "./cli";
import type { CliRun } from "./folderState";
import { storageFacts, type StorageFacts } from "./storage";

// Keep config parsing and writes in Go by delegating to `doan config`
// (ARCHITECTURE §7, Config bridge; POSTMORTEM 2026-10-22).

export type ConfigKind = "tokenCss" | "serve";
// storage/storageReason: where the worktree's Doan files are kept, absent from an older doan. repositoryCreated: this
// write created the project's Git repository (`written` names .git/).
export type ConfigReply =
  | ({ kind: "config"; root: string; tokenCss: string | null; serve: string[]; changed: boolean; repositoryCreated?: true } & StorageFacts)
  | { kind: "error"; message: string }
  | { kind: "unavailable" };
export type ConfigChoice = { kind: "selected"; choiceId: string; path: string } | { kind: "cancelled" } | { kind: "unavailable" };

export interface ConfigBridgeDeps {
  // `doan config --json --repo <root> ...args`; env only for a run that may create the repository (`--git-init`).
  run(root: string, args: string[], env?: CliEnv): Promise<CliRun>;
  // The environment the CLI's git is found with (cli.ts CliEnv); it reads the login shell, which can take seconds.
  gitEnv?(): Promise<CliEnv>;
  // The epoch of a stored, set-up root; null for anything else.
  epoch(root: string): number | null;
  // A sheet on the main window; null when cancelled.
  pick(root: string, kind: ConfigKind): Promise<string | null>;
  // A mode write succeeded for root: it applies to every worktree of the project, so main reads them all again. Also
  // after a failed repository creation, which may have left a .git/ that makes the folder read as inside Git.
  storageWritten?(root: string): void;
}

interface Choice { root: string; kind: ConfigKind; path: string; epoch: number }

function exact(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => key in value);
}

function isConfigResult(value: unknown): value is { serve: string[]; changed: boolean; tokenCss?: string } {
  if (typeof value !== "object" || value === null) return false;
  const serve: unknown = Reflect.get(value, "serve");
  const tokenCss: unknown = Reflect.get(value, "tokenCss");
  return Array.isArray(serve) && serve.every(path => typeof path === "string") &&
    typeof Reflect.get(value, "changed") === "boolean" && (tokenCss === undefined || typeof tokenCss === "string");
}

const UNEXPECTED = "doan config returned an unexpected result.";
// Project Settings' sentences for a failed repository creation (`--git-init` only): the CLI's are written for agents,
// and the page says what changed and names a .git it left behind (draft keep-out-git-init, frame project-settings).
const REPOSITORY_FAILURES: Record<string, (root: string) => string> = {
  git_missing: () => "Git isn’t installed, so Doan can’t create a repository here. Install the Command Line Tools with xcode-select --install, then choose Keep out of Git again.",
  git_init_failed: () => "Couldn’t create a Git repository here, so nothing changed.",
  cleanup_failed: root => `Couldn’t switch to Keep out of Git, and Doan couldn’t remove the Git repository it created at ${root}/.git. Remove it or keep it, then try again.`,
};

// The CLI's own message is what the human reads (nextSteps are for agents,
// as with init, 2026-10-24).
export function configReply(root: string, run: CliRun): ConfigReply {
  const error = (message: string): ConfigReply => ({ kind: "error", message });
  if (run.spawnError !== undefined) return error(`Couldn’t run doan: ${run.spawnError}`);
  if (run.timedOut) return error("doan config timed out after 10 s.");
  let value: unknown;
  try { value = JSON.parse(run.stdout); } catch { return error(run.stderr.split(/\r?\n/, 1)[0] || UNEXPECTED); }
  if (!validateEnvelope(value)) return error(UNEXPECTED);
  const envelope = value as { ok: true; result: unknown } | { ok: false; error: { code: string; message: string } };
  if (!envelope.ok) return error(REPOSITORY_FAILURES[envelope.error.code]?.(root) ?? envelope.error.message);
  if (run.exitCode !== 0 || !isConfigResult(envelope.result)) return error(UNEXPECTED);
  const { serve, changed, tokenCss } = envelope.result;
  const written: unknown = Reflect.get(envelope.result, "written");
  const created = Array.isArray(written) && written.includes(".git/");
  return { kind: "config", root, tokenCss: tokenCss ?? null, serve, changed, ...(created ? { repositoryCreated: true as const } : {}), ...storageFacts(envelope.result) };
}

// A storage write made outside Project Settings (a clone's Keep out of Git), told apart by the CLI's code: a run that
// did not answer with an envelope is internal_error, as the CLI's own unexpected failures are.
export function storageWrite(run: CliRun): { ok: true } | { ok: false; code: string } {
  let value: unknown;
  try { value = JSON.parse(run.stdout); } catch { return { ok: false, code: "internal_error" }; }
  if (run.spawnError !== undefined || run.timedOut || !validateEnvelope(value)) return { ok: false, code: "internal_error" };
  const envelope = value as { ok: true } | { ok: false; error: { code: string } };
  if (!envelope.ok) return { ok: false, code: envelope.error.code };
  return run.exitCode === 0 ? { ok: true } : { ok: false, code: "internal_error" };
}

export function createConfigBridge(deps: ConfigBridgeDeps) {
  const choices = new Map<string, Choice>();
  // The serve list of each root's last good result: Remove takes only these.
  // A read that runs or fails keeps the previous one.
  const lastServe = new Map<string, string[]>();
  // `doan config` takes no lock, so calls for one root run one at a time.
  const queues = new Map<string, Promise<unknown>>();
  // Bumped by clear(): reads, picker sheets and queued calls of an older
  // session (a closed dialog or a replaced renderer) must not touch
  // the next one's choices or serve lists, nor answer it.
  let session = 0;

  const root = (value: Record<string, unknown>): string | null =>
    typeof value.root === "string" && deps.epoch(value.root) !== null ? value.root : null;

  const call = (target: string, args: string[]): Promise<ConfigReply> => {
    const epoch = deps.epoch(target);
    const generation = session;
    const current = () => generation === session && deps.epoch(target) === epoch;
    const next = (queues.get(target) ?? Promise.resolve()).then(async (): Promise<ConfigReply> => {
      // Read before the check below: the project may be removed or re-rooted while the login shell is read, and such a
      // project must get no repository.
      const env = args.includes("--git-init") ? await deps.gitEnv?.() : undefined;
      // The project may have been removed and re-added, or the dialog closed,
      // while this call waited behind a slower one.
      if (!current()) return { kind: "unavailable" };
      const reply = configReply(target, await (env === undefined ? deps.run(target, args) : deps.run(target, args, env)));
      if (generation !== session) return { kind: "unavailable" };
      if (reply.kind === "config" && current()) lastServe.set(target, reply.serve);
      return reply;
    });
    queues.set(target, next.catch(() => undefined));
    return next;
  };

  const take = (target: string, kind: ConfigKind, id: unknown): Choice | null => {
    const choice = typeof id === "string" ? choices.get(id) : undefined;
    if (!choice || choice.root !== target || choice.kind !== kind || choice.epoch !== deps.epoch(target)) return null;
    choices.delete(id as string);
    return choice;
  };

  return {
    read(value: unknown): Promise<ConfigReply> {
      const target = exact(value, ["root"]) ? root(value) : null;
      return target === null ? Promise.resolve({ kind: "unavailable" }) : call(target, []);
    },

    async choose(value: unknown): Promise<ConfigChoice> {
      if (!exact(value, ["root", "kind"]) || (value.kind !== "tokenCss" && value.kind !== "serve")) return { kind: "unavailable" };
      const target = root(value);
      const kind: ConfigKind = value.kind;
      const epoch = target === null ? null : deps.epoch(target);
      if (target === null || epoch === null) return { kind: "unavailable" };
      const generation = session;
      const path = await deps.pick(target, kind);
      // The project may have been removed or re-rooted, or the dialog closed,
      // while the sheet was up.
      if (deps.epoch(target) !== epoch || generation !== session) return { kind: "unavailable" };
      if (path === null) return { kind: "cancelled" };
      const choiceId = randomUUID();
      choices.set(choiceId, { root: target, kind, path, epoch });
      return { kind: "selected", choiceId, path };
    },

    write(value: unknown): Promise<ConfigReply> {
      const unavailable = Promise.resolve<ConfigReply>({ kind: "unavailable" });
      if (typeof value !== "object" || value === null || !("op" in value)) return unavailable;
      const op = value.op;
      if (op === "setTokenCss" || op === "addServe") {
        const target = exact(value, ["root", "op", "choiceId"]) ? root(value) : null;
        const choice = target === null ? null : take(target, op === "setTokenCss" ? "tokenCss" : "serve", (value as Record<string, unknown>).choiceId);
        if (target === null || choice === null) return unavailable;
        return call(target, [op === "setTokenCss" ? "--token-css" : "--add-serve", choice.path]);
      }
      if (op === "setStorage") {
        // gitInit: Project Settings' confirmation to create the repository, only ever true and only with local.
        const gitInit = exact(value, ["root", "op", "storage", "gitInit"]);
        const target = exact(value, ["root", "op", "storage"]) || gitInit ? root(value) : null;
        const storage = (value as Record<string, unknown>).storage;
        if (target === null || (storage !== "repo" && storage !== "local")) return unavailable;
        if (gitInit && (storage !== "local" || (value as Record<string, unknown>).gitInit !== true)) return unavailable;
        return call(target, ["--storage", storage, ...(gitInit ? ["--git-init"] : [])]).then(reply => {
          if (reply.kind === "config" || (gitInit && reply.kind === "error")) deps.storageWritten?.(target);
          return reply;
        });
      }
      if (op === "clearTokenCss") {
        const target = exact(value, ["root", "op"]) ? root(value) : null;
        return target === null ? unavailable : call(target, ["--clear-token-css"]);
      }
      if (op === "removeServe") {
        const target = exact(value, ["root", "op", "path"]) ? root(value) : null;
        const path = (value as Record<string, unknown>).path;
        if (target === null || typeof path !== "string" || !lastServe.get(target)?.includes(path)) return unavailable;
        // Stored values are repo-relative; the CLI takes the absolute spelling.
        return call(target, ["--remove-serve", isAbsolute(path) ? path : join(target, path)]);
      }
      return unavailable;
    },

    // A Project Settings page mounted or unmounted, or the main renderer was replaced:
    // the earlier session's choices and reads go with it.
    clear(): void {
      session++;
      choices.clear();
      lastServe.clear();
    },
  };
}

export type ConfigBridge = ReturnType<typeof createConfigBridge>;
