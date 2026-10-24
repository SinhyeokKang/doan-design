import { randomUUID } from "node:crypto";
import { isAbsolute, join } from "node:path";
import { validateEnvelope } from "../formats/validate";
import type { CliRun } from "./folderState";

// The Projects tab's config (app-setup design 'Projects 탭'). The app never
// writes `.doan/config.json` itself: every read and write is `doan config`
// (POSTMORTEM 2026-10-22, config writes stay in Go).

export type ConfigKind = "tokenCss" | "serve";
export type ConfigReply =
  | { kind: "config"; root: string; tokenCss: string | null; serve: string[]; changed: boolean }
  | { kind: "error"; message: string }
  | { kind: "unavailable" };
export type ConfigChoice = { kind: "selected"; choiceId: string; path: string } | { kind: "cancelled" } | { kind: "unavailable" };

export interface ConfigBridgeDeps {
  // `doan config --json --repo <root> ...args`.
  run(root: string, args: string[]): Promise<CliRun>;
  // The epoch of a stored, set-up root; null for anything else.
  epoch(root: string): number | null;
  // A sheet on the Settings window; null when cancelled.
  pick(root: string, kind: ConfigKind): Promise<string | null>;
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

// The CLI's own message is what the human reads (nextSteps are for agents,
// as with init, 2026-10-24).
export function configReply(root: string, run: CliRun): ConfigReply {
  const error = (message: string): ConfigReply => ({ kind: "error", message });
  if (run.spawnError !== undefined) return error(`Couldn’t run doan: ${run.spawnError}`);
  if (run.timedOut) return error("doan config timed out after 10 s.");
  let value: unknown;
  try { value = JSON.parse(run.stdout); } catch { return error(run.stderr.split(/\r?\n/, 1)[0] || UNEXPECTED); }
  if (!validateEnvelope(value)) return error(UNEXPECTED);
  const envelope = value as { ok: true; result: unknown } | { ok: false; error: { message: string } };
  if (!envelope.ok) return error(envelope.error.message);
  if (run.exitCode !== 0 || !isConfigResult(envelope.result)) return error(UNEXPECTED);
  const { serve, changed, tokenCss } = envelope.result;
  return { kind: "config", root, tokenCss: tokenCss ?? null, serve, changed };
}

export function createConfigBridge(deps: ConfigBridgeDeps) {
  const choices = new Map<string, Choice>();
  // The serve list of each root's last good result: Remove takes only these.
  // A read that runs or fails keeps the previous one.
  const lastServe = new Map<string, string[]>();
  // `doan config` takes no lock, so calls for one root run one at a time.
  const queues = new Map<string, Promise<unknown>>();

  const root = (value: Record<string, unknown>): string | null =>
    typeof value.root === "string" && deps.epoch(value.root) !== null ? value.root : null;

  const call = (target: string, args: string[]): Promise<ConfigReply> => {
    const next = (queues.get(target) ?? Promise.resolve()).then(async () => {
      const reply = configReply(target, await deps.run(target, args));
      if (reply.kind === "config") lastServe.set(target, reply.serve);
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
      const path = await deps.pick(target, kind);
      // The project may have been removed or re-rooted while the sheet was up.
      if (deps.epoch(target) !== epoch) return { kind: "unavailable" };
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

    // The Settings window closed: its choices and reads go with it.
    clear(): void {
      choices.clear();
      lastServe.clear();
    },
  };
}

export type ConfigBridge = ReturnType<typeof createConfigBridge>;
