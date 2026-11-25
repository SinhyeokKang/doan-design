import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fenceArgs, resolveFencePaths, SANDBOX_EXEC } from "./fence";
import type { Provider } from "./types";

// The policy applied by the real Seatbelt, path by path. A runner already inside a Seatbelt policy cannot apply another
// one (exit 71), so the suite skips there; CI's macOS runner applies it.
const usable = process.platform === "darwin" && spawnSync(SANDBOX_EXEC, ["-p", "(version 1)(allow default)", "/usr/bin/true"]).status === 0;

const roots: string[] = []; afterAll(() => { roots.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
function world(provider: Provider) {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), "doan-seatbelt-"))); roots.push(base);
  const userData = join(base, "userData"), profile = join(userData, "agent-auth", "profiles", provider);
  for (const dir of [profile, join(userData, "attachments"), join(userData, "conversations")]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(userData, "conversation-runtime.json"), "{}");
  // The agent's own folder exists before any fenced process: Doan writes the doan skill stub into it first, and
  // Antigravity's token into .gemini/antigravity-acp/ (the vault's working copy).
  const folders = { claude: [], codex: [], copilot: [".copilot"], cursor: [".cursor"], antigravity: [".gemini/config", ".gemini/antigravity-acp"] }[provider];
  for (const folder of folders) mkdirSync(join(profile, folder), { recursive: true });
  return { userData, profile };
}
// Each path is created with its parents by a shell inside the fence; the answer is the paths that were written.
function written(provider: Provider, rels: readonly string[], { userData, profile } = world(provider)): string[] {
  const paths = resolveFencePaths({ provider, userData, profileDir: profile, attachments: [] }, path => realpathSync.native(path))!;
  const script = 'for rel in "$@"; do mkdir -p "$(dirname "$PROFILE/$rel")" 2>/dev/null; if : >> "$PROFILE/$rel" 2>/dev/null; then echo "$rel"; fi; done';
  const run = spawnSync(SANDBOX_EXEC, [...fenceArgs(provider, paths), "/bin/sh", "-c", script, "sh", ...rels], { env: { PATH: "/usr/bin:/bin", PROFILE: profile }, encoding: "utf8" });
  expect(run.status).toBe(0);
  return run.stdout.split("\n").filter(Boolean);
}
// Other agents' folders in a dedicated HOME, which Copilot and Cursor read as the person's own; a tool cache beside
// them stays writable.
const HOME_STORES = [".agents/skills/a/SKILL.md", ".claude/settings.json", ".claude/commands/a.md", ".claude/skills/a/SKILL.md", ".codex/skills/a/SKILL.md", ".grok/skills/a/SKILL.md", ".agents"];
function expectWrites(provider: Provider, open: readonly string[], closed: readonly string[]) {
  expect(written(provider, [...open, ...closed])).toEqual(open);
}

describe.runIf(usable)("the outer fence's writes in the agent's folder", () => {
  // Claude's session transcript, shell snapshot, .claude.json and signed-in caches. session-env/ stays closed: hooks leave
  // environment files there that the session's commands source again on resume.
  it("lets Claude write its sessions, transcripts and state and nothing a later turn reads as settings or instructions", () => {
    expectWrites("claude", [
      ".claude.json", ".claude.json.tmp.85251.42ac2059", "backups/.claude.json.backup.1", ".credentials.json", "projects/-repo/1b9d.jsonl", "projects/-repo/1b9d/subagents/a.jsonl",
      ".storage-write.lock", "sessions/1b9d.json", "shell-snapshots/snapshot-zsh-1.sh", "file-history/1b9d/a@v1", "todos/1b9d.json", "plans/a.md", "tasks/1b9d/1.json",
      "cache/model-catalog", "statsig/x", "debug/1b9d.txt", "paste-cache/a", "image-cache/a", "telemetry/a", "history.jsonl", "stats-cache.json", "mcp-needs-auth-cache.json", ".last-cleanup",
    ], [
      "CLAUDE.md", "session-env/1b9d/sessionstart-hook-0.sh", "settings.json", ".mcp.json", ".claude/settings.json", "rules/a.md", "output-styles/a.md", "skills/a/SKILL.md", "agents/a.md", "commands/a.md",
      ".storage-write.other", "plugins/a/plugin.json", "hooks/a.json", "remote-settings.json", "policy-limits.json", "daemon/a", "workflows/a", "x",
    ]);
  });
  it("allows Claude's account refresh lock, its owner record and the temporary owner write", () => {
    expectWrites("claude", [".oauth_refresh.lock", ".oauth_refresh.lock.owner", ".oauth_refresh.lock.owner.tmp.6bb75133"], [
      ".oauth_refresh.locked", ".oauth_refresh.lock.other", ".oauth_refresh.lock.owners", ".oauth_refresh.lock.owner.tmpfile",
    ]);
  });
  it("allows only profile-root refresh locks for Doan MCP connectors", () => {
    const lock = "mcp-refresh-doan_notion_eac663db915250e7.lock.lock";
    // Create the closed parent outside the fence so a misplaced rule would actually allow the nested write.
    const { userData, profile } = world("claude");
    mkdirSync(join(profile, "skills"));
    expect(written("claude", [lock, "mcp-refresh-doan_127_0_0_1_0123456789abcdef.lock.lock",
      `skills/${lock}`, lock + ".tmp", lock.replace("doan_", "other_"), lock.replace("eac6", "gac6"),
      lock.replace("eac6", "eac"), lock.replace("notion", "abcdefghijklmnopq"),
    ], { userData, profile })).toEqual([lock, "mcp-refresh-doan_127_0_0_1_0123456789abcdef.lock.lock"]);
  });
  // Codex in Full access: its stores and caches, runtime helpers under tmp/, temporary files it renames onto root files,
  // and the SQLite databases at the root, whatever their version suffix.
  it("lets Codex write its stores and caches and none of its instruction or settings files", () => {
    expectWrites("codex", [
      "sessions/2026/11/19/rollout-a.jsonl", "archived_sessions/a.jsonl", "shell_snapshots/a.sh", "memories/a.md", "tmp/arg0/codex-arg0Ab/apply_patch", ".tmp/plugins.sync.lock", ".tmpAb12Cd",
      "cache/codex_apps_tools", "log/codex-tui.log", "thread-writer-locks/.coordination.lock", "installation_id", ".sandbox_migration", "models_cache.json", "auth.json.lock", "auth.lock",
      "state_5.sqlite", "state_5.sqlite-wal", "thread_history_1.sqlite-shm", "goals_2.sqlite", ".sqlite-maintenance.lock",
    ], [
      "AGENTS.md", "AGENTS.override.md", "auth.json", "config.toml", "hooks.json", "managed_config.toml", ".env", "rules/doan.rules", "prompts/a.md", "skills/a/SKILL.md", "plugins/a/plugin.json", "x",
    ]);
  });
  // Copilot's session state and store, logs, and config and settings files with their locks; the rest of the dedicated
  // HOME is the agent's own commands' HOME.
  it("lets Copilot write its sessions, logs and login and none of its instruction or plugin files", () => {
    expectWrites("copilot", [
      ".copilot/session-state/1b9d/workspace.yaml", ".copilot/session-store.db", ".copilot/session-store.db-wal", ".copilot/logs/process-1.log", ".copilot/plugin-data/_direct/a",
      ".copilot/config.json", ".copilot/settings.json", ".copilot/settings.json.lock", ".local/state/gh/device-id", "Library/Caches/copilot/exp-cache.json", ".npm/_cacache/a", ".cache/pip/a",
    ], [...HOME_STORES,
      ".copilot/copilot-instructions.md", ".copilot/agents/a.md", ".copilot/skills/a/SKILL.md", ".copilot/hooks/a.json", ".copilot/mcp-config.json", ".copilot/installed-plugins/a/plugin.json", ".copilot/x",
    ]);
  });
  // Cursor's ACP sessions, state, caches and login. cli-config.json holds its permission allow list; Cursor starts and
  // opens its ACP server without writing it.
  it("lets Cursor write its sessions, state and login and none of its rules, skills, hooks or MCP files", () => {
    expectWrites("cursor", [
      ".cursor/acp-sessions/1b9d.json", ".cursor/ai-tracking/a.db", ".cursor/statsig-cache.json", ".cursor/agent-cli-state.json", ".cursor/auth.json",
      "Library/Caches/cursor-compile-cache/a", ".npm/_cacache/a",
    ], [...HOME_STORES,
      ".cursor/cli-config.json", ".cursor/rules/a.mdc", ".cursor/mcp.json", ".cursor/hooks.json", ".cursor/skills/a/SKILL.md", ".cursor/skills-cursor/a/SKILL.md", ".cursor/agents/a.md", ".cursor/commands/a.md",
      ".cursor/plugins/a/plugin.json", ".cursor/sandbox.json", ".cursor/x",
    ]);
  });
  // cursor-agent creates its worker socket folder at start (mkdir -p). It shares .cursor/projects/<workspace>/ with MCP
  // approvals a later run reads, and a rule allowing the mkdir would allow a rename too, so Doan creates it (prepare.ts).
  it("lets Cursor's recursive mkdir pass on the worker folder Doan made, and write nothing in it or beside it", () => {
    const w = world("cursor");
    mkdirSync(join(w.profile, ".cursor", "projects", "p-988fa62"), { recursive: true });
    mkdirSync(join(w.profile, "stage"), { recursive: true }); writeFileSync(join(w.profile, "stage", "mcp-approvals.json"), "{}");
    const paths = resolveFencePaths({ provider: "cursor", userData: w.userData, profileDir: w.profile, attachments: [] }, path => realpathSync.native(path))!;
    const run = (script: string) => spawnSync(SANDBOX_EXEC, [...fenceArgs("cursor", paths), process.execPath, "-e", script], { env: { PROFILE: w.profile }, encoding: "utf8" }).status;
    const mkdir = (rel: string) => `require("node:fs").mkdirSync(process.env.PROFILE + "/.cursor/${rel}", { recursive: true })`;
    expect(run(mkdir("projects/p-988fa62"))).toBe(0);
    expect(run(`require("node:fs").writeFileSync(process.env.PROFILE + "/.cursor/projects/p-988fa62/mcp-approvals.json", "{}")`)).not.toBe(0);
    expect(run(mkdir("projects/p-1234567"))).not.toBe(0);
    expect(run(mkdir("p-1234567"))).not.toBe(0);
    expect(run(`require("node:fs").renameSync(process.env.PROFILE + "/stage", process.env.PROFILE + "/.cursor/projects/w-repo")`)).not.toBe(0);
  });
  // Antigravity's conversations, brain and token per turn, its own folder of transcripts and helpers, and
  // per-conversation databases in config/.
  it("lets Antigravity write its conversations, brain and token and none of its config, memory or settings", () => {
    expectWrites("antigravity", [
      ".gemini/antigravity-acp/conversations/a.pb", ".gemini/antigravity-acp/brain/a/b.md", ".gemini/antigravity-acp/acp_token.json", ".gemini/antigravity/bin/webm_encoder",
      ".gemini/config/f58ecf9c-7be2-400c-897f-2b84dc9464e3.db-wal", ".gemini/config/f58ecf9c-7be2-400c-897f-2b84dc9464e3.meta", ".npm/_cacache/a",
    ], [...HOME_STORES,
      ".gemini/GEMINI.md", ".gemini/settings.json", ".gemini/config/memory.txtpb", ".gemini/config/mcp_config.json", ".gemini/config/hooks.json", ".gemini/config/skills/a/SKILL.md",
      ".gemini/config/workflows/a.md", ".gemini/antigravity-acp/settings.json", ".gemini/antigravity-acp/trusted_workspaces.json", ".gemini/antigravity-cli/skills/a/SKILL.md", ".gemini/x",
    ]);
  });
});
