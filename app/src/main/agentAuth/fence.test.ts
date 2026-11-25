import { describe, expect, it } from "vitest";
import { codexMechanism, codexProfileArgs, cursorWorkerDir, codexRestart, codexTurnPermission, fenceArgs, fenceDenied, fencedCommand, fenceListingDirs, fencePolicy, fencedEverywhere, profileFencedCommand, resolveFencePaths, SANDBOX_EXEC, sandboxRefused, type FenceListing, type FencePaths } from "./fence";
import { PERMISSION_MODES } from "../conversation/permissionMode";
import type { Provider } from "./types";

// The policy text that passed real provider runs, byte for byte.
const BASE = `(version 1)
(allow default)
(deny file-read* file-write* (subpath (param "USERDATA")))
(allow file-read-metadata (literal (param "USERDATA")) (literal (param "AGENT_AUTH")) (literal (param "PROFILES")))
(allow file-read* file-write* (subpath (param "PROFILE")))
(allow file-read* (literal (param "RUNTIME")))
(allow file-read* (subpath (param "ATTACHMENTS")))
`;
const HOOK = `(allow file-read* (literal (param "BROWSER_HOOK")))
`;
const ANTIGRAVITY = `(allow file-read-metadata (literal (param "AGENT_RUNTIMES")))
(allow file-read* (subpath (param "AGENT_RUNTIME")))
`;
// The agent's own folder closed to writes, then what its CLI writes there reopened (fence.seatbelt.test.ts holds the
// lists path by path).
const agent = (dirs: number, files: number, pattern = "", home = false) => `(deny file-write* (subpath (param "AGENT_FOLDER")))
${home ? '(deny file-write* (subpath (param "HOME_STORE_1")) (subpath (param "HOME_STORE_2")) (subpath (param "HOME_STORE_3")) (subpath (param "HOME_STORE_4")))\n' : ""}(allow file-write*${Array.from({ length: dirs }, (_, i) => ` (subpath (param "AGENT_DIR_${i + 1}"))`).join("")}${Array.from({ length: files }, (_, i) => ` (prefix (param "AGENT_FILE_${i + 1}"))`).join("")})
${pattern ? `(allow file-write* (require-all (subpath (param "AGENT_FOLDER")) (regex #"${pattern}")))
` : ""}`;
const CLAUDE = agent(14, 7) + `(let ((account-lock (string-append (param "AGENT_FOLDER") "/.oauth_refresh.lock")))
  (allow file-write* (literal account-lock) (literal (string-append account-lock ".owner")) (prefix (string-append account-lock ".owner.tmp."))))
(allow file-write* (regex (string-append "^" (regex-quote (param "AGENT_FOLDER")) #"/mcp-refresh-doan_[a-z0-9]${"[a-z0-9_]?".repeat(15)}_${"[0-9a-f]".repeat(16)}\\.lock\\.lock$")))
`;
const CODEX = agent(8, 6, "\\.sqlite[^/]*$"), COPILOT = agent(3, 3, "", true), CURSOR = agent(2, 3, "", true), GEMINI = agent(3, 2, "/config/[0-9a-f-]+\\.(db|meta)[^/]*$", true);

const U = "/Users/ada/Library/Application Support/doan";
const P = `${U}/agent-auth/profiles/claude`;
const paths = (over: Partial<FencePaths> = {}): FencePaths => ({ userData: U, profile: P, attachments: [], ...over });
const params = (args: readonly string[]) => {
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) if (args[i] === "-D") { const [name, ...rest] = args[i + 1]!.split("="); out[name!] = rest.join("="); }
  return out;
};

describe("fencePolicy", () => {
  // A later conversation reads the agent's folder as its instructions, settings, skills and hooks, so a fenced run
  // writes there only what its CLI needs to.
  it("closes the agent's own folder to writes and reopens what its CLI writes", () => {
    expect(fencePolicy("cursor")).toBe(BASE + CURSOR);
    expect(fencePolicy("copilot")).toBe(BASE + COPILOT);
    expect(fencePolicy("codex")).toBe(BASE + CODEX);
  });
  it("adds the browser hook for Claude and the hook and agent runtime for Antigravity", () => {
    expect(fencePolicy("claude")).toBe(BASE + CLAUDE + HOOK);
    expect(fencePolicy("antigravity")).toBe(BASE + GEMINI + HOOK + ANTIGRAVITY);
  });
  it("is the same text with no pasted image or one", () => {
    for (const provider of ["cursor", "claude", "antigravity"] as Provider[]) expect(fencePolicy(provider, 1)).toBe(fencePolicy(provider, 0));
  });
  it("appends one read rule per further pasted image and leaves the rest unchanged", () => {
    expect(fencePolicy("claude", 3)).toBe(BASE + CLAUDE + HOOK + `(allow file-read* (subpath (param "ATTACHMENTS_2")))
(allow file-read* (subpath (param "ATTACHMENTS_3")))
`);
  });
});

describe("fenceArgs", () => {
  it("passes the policy with -p and every path as a -D parameter in the order of the runs that passed", () => {
    const att = `${U}/attachments/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed`;
    const args = fenceArgs("claude", paths({ attachments: [att] }));
    expect(args.slice(0, 16)).toEqual(["-p", BASE + CLAUDE + HOOK,
      "-D", `USERDATA=${U}`, "-D", `AGENT_AUTH=${U}/agent-auth`, "-D", `PROFILES=${U}/agent-auth/profiles`, "-D", `PROFILE=${P}`,
      "-D", `RUNTIME=${U}/conversation-runtime.json`, "-D", `ATTACHMENTS=${att}`, "-D", `BROWSER_HOOK=${U}/agent-auth/browser-hook`]);
    expect(args.slice(16, 20)).toEqual(["-D", `AGENT_FOLDER=${P}`, "-D", `AGENT_DIR_1=${P}/projects`]);
  });
  // Claude Code and Codex keep their whole state in the profile (CLAUDE_CONFIG_DIR, CODEX_HOME); the HOME-profile
  // providers keep theirs in one folder of it, and the rest is the HOME their agent's own commands write to.
  it("names the agent's own folder: the profile for Claude and Codex, the CLI's folder in the dedicated HOME otherwise", () => {
    for (const [provider, folder] of [["claude", ""], ["codex", ""], ["copilot", "/.copilot"], ["cursor", "/.cursor"], ["antigravity", "/.gemini"]] as const) {
      const profile = `${U}/agent-auth/profiles/${provider}`;
      expect(params(fenceArgs(provider, paths({ profile }))).AGENT_FOLDER).toBe(profile + folder);
    }
  });
  // Copilot reads ~/.agents/skills and Cursor .agents, .claude, .codex and .grok in its HOME as the person's own skills,
  // commands and settings; the whole folders close, so none can be moved into place either.
  it("closes other agents' folders in a dedicated HOME and names none for Claude or Codex", () => {
    for (const provider of ["copilot", "cursor", "antigravity"] as const) {
      const profile = `${U}/agent-auth/profiles/${provider}`;
      expect(params(fenceArgs(provider, paths({ profile })))).toMatchObject({ HOME_STORE_1: `${profile}/.agents`, HOME_STORE_2: `${profile}/.claude`, HOME_STORE_3: `${profile}/.codex`, HOME_STORE_4: `${profile}/.grok` });
    }
    for (const provider of ["claude", "codex"] as const) expect(Object.keys(params(fenceArgs(provider, paths())))).not.toContain("HOME_STORE_1");
  });
  it("reopens only Copilot's sessions, logs, plugin data, login and settings", () => {
    const profile = `${U}/agent-auth/profiles/copilot`, c = `${profile}/.copilot`;
    expect(params(fenceArgs("copilot", paths({ profile })))).toMatchObject({ AGENT_DIR_1: `${c}/session-state`, AGENT_DIR_2: `${c}/logs`, AGENT_DIR_3: `${c}/plugin-data`,
      AGENT_FILE_1: `${c}/config.json`, AGENT_FILE_2: `${c}/settings.json`, AGENT_FILE_3: `${c}/session-store.db` });
  });
  it("gives Antigravity its agent runtime", () => {
    const profile = `${U}/agent-auth/profiles/antigravity`;
    const args = fenceArgs("antigravity", paths({ profile }));
    expect(args[1]).toBe(fencePolicy("antigravity"));
    expect(params(args)).toMatchObject({ AGENT_RUNTIMES: `${U}/agent-runtimes`, AGENT_RUNTIME: `${U}/agent-runtimes/antigravity-acp` });
  });
  it("re-allows the profile as the attachment parameter when the turn has no pasted image", () => {
    expect(params(fenceArgs("cursor", paths({ profile: `${U}/agent-auth/profiles/cursor` }))).ATTACHMENTS).toBe(`${U}/agent-auth/profiles/cursor`);
  });
  it("names every further pasted image directory and only those", () => {
    const a = [1, 2, 3].map(n => `${U}/attachments/${n}`);
    const args = fenceArgs("copilot", paths({ profile: `${U}/agent-auth/profiles/copilot`, attachments: a }));
    expect(args[1]).toBe(fencePolicy("copilot", 3));
    expect(params(args)).toMatchObject({ ATTACHMENTS: a[0], ATTACHMENTS_2: a[1], ATTACHMENTS_3: a[2] });
  });
  it("names no other provider's profile and no Doan path beyond the allowed ones", () => {
    const values = Object.values(params(fenceArgs("claude", paths())));
    expect(values.filter(v => v.startsWith(`${U}/agent-auth/profiles/`) && !v.startsWith(`${P}/`))).toEqual([P, P, P]);
    for (const closed of ["CLAUDE.md", "settings.json", "rules", "skills", "agents", "commands", "plugins", "output-styles", ".claude", ".mcp.json"]) expect(values.some(v => v === `${P}/${closed}` || v.startsWith(`${P}/${closed}/`))).toBe(false);
    expect(values.some(v => v.includes("conversations") || v.includes("vault"))).toBe(false);
  });
  it("keeps a path with quotes, spaces and parentheses as one argument", () => {
    const odd = `/tmp/a "b" (c)`;
    expect(params(fenceArgs("cursor", { userData: odd, profile: `${odd}/agent-auth/profiles/cursor`, attachments: [] })).USERDATA).toBe(odd);
  });
});

describe("resolveFencePaths", () => {
  const real = (map: Record<string, string>) => (path: string) => { const hit = map[path]; if (hit === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); return hit; };
  const fs = real({ "/var/u": "/private/var/u", [`/var/u/agent-auth/profiles/claude`]: `/private/var/u/agent-auth/profiles/claude`, [`/var/u/agent-auth/profiles/codex-7`]: `/private/var/u/agent-auth/profiles/codex-7`,
    "/var/u/attachments": "/private/var/u/attachments", "/var/u/link": "/elsewhere/profile", "/private/var/u/attachments": "/private/var/u/attachments",
    "/private/var/u/attachments/0f4e/pasted.png": "/private/var/u/attachments/0f4e/pasted.png", "/private/var/u/attachments/0f4e/other.png": "/private/var/u/attachments/0f4e/other.png",
    "/private/var/u/attachments/77aa/capture.png": "/private/var/u/attachments/77aa/capture.png", "/var/u/attachments/99bb/via-link.png": "/private/var/u/attachments/99bb/via-link.png",
    "/private/var/u/conversations/x.png": "/private/var/u/conversations/x.png", "/private/var/u/attachments/top.png": "/private/var/u/attachments/top.png", "/Users/ada/Desktop/shot.png": "/Users/ada/Desktop/shot.png" });
  it("resolves userData and the profile so Seatbelt compares the paths it sees", () => {
    expect(resolveFencePaths({ provider: "claude", userData: "/var/u", profileDir: "/var/u/agent-auth/profiles/claude", attachments: [] }, fs))
      .toEqual({ userData: "/private/var/u", profile: "/private/var/u/agent-auth/profiles/claude", attachments: [] });
  });
  it("opens a staging profile as its own directory only", () => {
    expect(resolveFencePaths({ provider: "codex", userData: "/var/u", profileDir: "/var/u/agent-auth/profiles/codex-7", attachments: [] }, fs)?.profile).toBe("/private/var/u/agent-auth/profiles/codex-7");
  });
  it("takes this turn's pasted image directories and leaves files outside userData alone", () => {
    const pasted = "/private/var/u/attachments/0f4e/pasted.png", again = "/private/var/u/attachments/0f4e/other.png", second = "/private/var/u/attachments/77aa/capture.png";
    expect(resolveFencePaths({ provider: "claude", userData: "/var/u", profileDir: "/var/u/agent-auth/profiles/claude", attachments: [pasted, "/Users/ada/Desktop/shot.png", again, second] }, fs)?.attachments)
      .toEqual(["/private/var/u/attachments/0f4e", "/private/var/u/attachments/77aa"]);
  });
  // An attachment recorded through a link (an unresolved /var path) would miss the resolved store and stay closed.
  it("resolves an attachment path before matching it to the store", () => {
    expect(resolveFencePaths({ provider: "claude", userData: "/var/u", profileDir: "/var/u/agent-auth/profiles/claude", attachments: ["/var/u/attachments/99bb/via-link.png"] }, fs)?.attachments).toEqual(["/private/var/u/attachments/99bb"]);
  });
  it("leaves an attachment that no longer resolves closed rather than refusing the run", () => {
    expect(resolveFencePaths({ provider: "claude", userData: "/var/u", profileDir: "/var/u/agent-auth/profiles/claude", attachments: ["/private/var/u/attachments/gone/x.png"] }, fs)?.attachments).toEqual([]);
  });
  it("does not open a file elsewhere in userData that is not a pasted image directory", () => {
    expect(resolveFencePaths({ provider: "claude", userData: "/var/u", profileDir: "/var/u/agent-auth/profiles/claude", attachments: ["/private/var/u/conversations/x.png", "/private/var/u/attachments/top.png"] }, fs)?.attachments).toEqual([]);
  });
  it("gives Codex the whole attachment directory, since its server outlives a turn", () => {
    expect(resolveFencePaths({ provider: "codex", userData: "/var/u", profileDir: "/var/u/agent-auth/profiles/codex-7", attachments: ["/private/var/u/attachments/0f4e/a.png"] }, fs)?.attachments).toEqual(["/private/var/u/attachments"]);
  });
  it("refuses relative paths and every control character", () => {
    for (const [userData, profileDir] of [["var/u", "/var/u/agent-auth/profiles/claude"], ["/var/u", "agent-auth/profiles/claude"], ["/var/u\0", "/var/u/agent-auth/profiles/claude"], ["/var/u", "/var/u/agent-auth/profiles/claude\n"],
      ["/var/u\x01", "/var/u/agent-auth/profiles/claude"], ["/var/u", "/var/u/agent-auth/profiles/claude\x7f"], ["/var/u\t", "/var/u/agent-auth/profiles/claude"]] as const)
      expect(resolveFencePaths({ provider: "claude", userData, profileDir, attachments: [] }, fs)).toBeNull();
    expect(resolveFencePaths({ provider: "claude", userData: "/var/u", profileDir: "/var/u/agent-auth/profiles/claude", attachments: ["/private/var/u/attachments/a\nb/x.png"] }, fs)).toBeNull();
  });
  it("refuses a path that does not resolve", () => {
    expect(resolveFencePaths({ provider: "claude", userData: "/var/gone", profileDir: "/var/u/agent-auth/profiles/claude", attachments: [] }, fs)).toBeNull();
  });
  it("refuses a profile that is not directly under userData's profiles directory", () => {
    expect(resolveFencePaths({ provider: "claude", userData: "/var/u", profileDir: "/var/u/link", attachments: [] }, fs)).toBeNull();
    expect(resolveFencePaths({ provider: "claude", userData: "/var/u", profileDir: "/var/u", attachments: [] }, fs)).toBeNull();
  });
});

// Processes Doan starts outside a conversation load files an agent in that provider's outer fence can write (MCP
// servers .claude.json names, Copilot's package cache), so they run in the outer fence.
describe("profileFencedCommand", () => {
  const real = (path: string) => path.replace("/link", "");
  it("runs the command under sandbox-exec with Claude's policy and the resolved profile", () => {
    const launch = profileFencedCommand("claude", { userData: `/link${U}` }, `/link${P}`, "/bin/claude", ["mcp", "list"], real)!;
    expect(launch.command).toBe(SANDBOX_EXEC);
    expect(launch.args.slice(-3)).toEqual(["/bin/claude", "mcp", "list"]);
    expect(launch.args[1]).toBe(fencePolicy("claude"));
    expect(params(launch.args)).toMatchObject({ USERDATA: U, PROFILE: P, AGENT_FOLDER: P, BROWSER_HOOK: `${U}/agent-auth/browser-hook` });
  });
  it("runs a Copilot command under Copilot's policy in its own profile", () => {
    const copilot = `${U}/agent-auth/profiles/copilot`;
    const launch = profileFencedCommand("copilot", { userData: U }, copilot, "/bin/copilot", ["login"], real)!;
    expect(launch.command).toBe(SANDBOX_EXEC);
    expect(launch.args.slice(-2)).toEqual(["/bin/copilot", "login"]);
    expect(launch.args[1]).toBe(fencePolicy("copilot"));
    expect(params(launch.args)).toMatchObject({ USERDATA: U, AGENT_AUTH: `${U}/agent-auth`, PROFILES: `${U}/agent-auth/profiles`, PROFILE: copilot, RUNTIME: `${U}/conversation-runtime.json`, ATTACHMENTS: copilot, AGENT_FOLDER: `${copilot}/.copilot` });
  });
  it("takes another sandbox-exec path", () => {
    expect(profileFencedCommand("claude", { userData: U, exec: "/tmp/exec" }, P, "/bin/claude", [], real)!.command).toBe("/tmp/exec");
  });
  it("is null when the fence cannot be built, so nothing starts unfenced", () => {
    expect(profileFencedCommand("claude", { userData: U }, "/elsewhere/claude", "/bin/claude", [], real)).toBeNull();
    expect(profileFencedCommand("copilot", { userData: U }, P, "/bin/copilot", [], () => { throw new Error("ENOENT"); })).toBeNull();
  });
});

// Every Copilot process imports the JavaScript in the profile's package cache, which its own fenced turn can rewrite;
// the other providers' sign-in and status commands run nothing planted in their profiles.
it("fences every process of Copilot and Cursor and of no other provider", () => {
  expect((["claude", "codex", "cursor", "antigravity", "copilot"] as const).filter(fencedEverywhere)).toEqual(["cursor", "copilot"]);
});

// sandbox-exec exits 65 for a policy error and 71 when it cannot exec the command, each with its own "sandbox-exec:"
// line; a CLI that exits 65 or 71 by itself writes no such line.
describe("sandboxRefused", () => {
  it("is sandbox-exec's own refusal only: exit 65 or 71 with its stderr line", () => {
    expect(sandboxRefused({ exitCode: 71, stderr: "sandbox-exec: execvp() of '/bin/cli' failed: No such file or directory\n" })).toBe(true);
    expect(sandboxRefused({ exitCode: 65, stderr: "warn\nsandbox-exec: invalid policy\n" })).toBe(true);
    expect(sandboxRefused({ exitCode: 71, stderr: "cli: internal error\n" })).toBe(false);
    expect(sandboxRefused({ exitCode: 65, stderr: "" })).toBe(false);
    expect(sandboxRefused({ exitCode: 1, stderr: "sandbox-exec: invalid policy\n" })).toBe(false);
    expect(sandboxRefused({ exitCode: null, stderr: "sandbox-exec: invalid policy\n" })).toBe(false);
  });
});
describe("fencedCommand", () => {
  it("runs the original command and arguments, in order, under sandbox-exec", () => {
    expect(fencedCommand("/bin/agent", ["-c", "a=b", "app-server"], ["-p", "X", "-D", "A=/a"]))
      .toEqual({ command: SANDBOX_EXEC, args: ["-p", "X", "-D", "A=/a", "/bin/agent", "-c", "a=b", "app-server"] });
  });
  it("leaves a run without a fence as it was", () => {
    expect(fencedCommand("/bin/agent", ["x"])).toEqual({ command: "/bin/agent", args: ["x"] });
  });
  it("takes another sandbox-exec path, so a missing one can be tested", () => {
    expect(fencedCommand("/bin/agent", [], ["-p", "X"], "/nowhere/sandbox-exec").command).toBe("/nowhere/sandbox-exec");
  });
});

describe("fenceDenied", () => {
  const listing: FenceListing = new Map([
    [U, [{ name: "agent-auth", directory: true }, { name: "attachments", directory: true }, { name: "conversations", directory: true }, { name: "conversation-runtime.json", directory: false }, { name: "runtime.json", directory: false }, { name: "sessions.jsonl", directory: false }, { name: "agent-runtimes", directory: true }]],
    [`${U}/agent-auth`, [{ name: "profiles", directory: true }, { name: "vault", directory: true }, { name: "metadata.json", directory: false }, { name: "browser-hook", directory: false }]],
    [`${U}/agent-auth/profiles`, [{ name: "claude", directory: true }, { name: "codex", directory: true }, { name: "codex-7", directory: true }, { name: "cursor", directory: true }]],
    [`${U}/attachments`, [{ name: "0f4e", directory: true }, { name: "77aa", directory: true }]],
  ]);
  const dir = (path: string) => ({ path, directory: true }), file = (path: string) => ({ path, directory: false });
  const codex = { userData: U, profile: `${U}/agent-auth/profiles/codex`, attachments: [`${U}/attachments`] };
  it("leaves Codex the whole attachment store and denies the browser hook it does not run", () => {
    expect(fenceListingDirs(codex)).toEqual([U, `${U}/agent-auth`, `${U}/agent-auth/profiles`]);
    expect(fenceDenied(codex, listing)).toEqual([
      dir(`${U}/conversations`), file(`${U}/runtime.json`), file(`${U}/sessions.jsonl`), dir(`${U}/agent-runtimes`),
      dir(`${U}/agent-auth/vault`), file(`${U}/agent-auth/metadata.json`), file(`${U}/agent-auth/browser-hook`),
      dir(`${U}/agent-auth/profiles/claude`), dir(`${U}/agent-auth/profiles/codex-7`), dir(`${U}/agent-auth/profiles/cursor`),
    ]);
  });
  it("never denies an allowed path or one of its ancestors", () => {
    const denied = fenceDenied(codex, listing)!.map(e => e.path);
    for (const allowed of [U, codex.profile, `${U}/conversation-runtime.json`, `${U}/agent-auth/profiles`, `${U}/agent-auth`, `${U}/attachments`]) expect(denied).not.toContain(allowed);
  });
  it("refuses when an ancestor could not be listed", () => {
    expect(fenceDenied(codex, new Map([...listing].filter(([d]) => d !== `${U}/agent-auth`)))).toBeNull();
  });
  // TOML basic strings take no U+007F, which JSON.stringify leaves as it is.
  it("refuses a name a permission rule or profile entry would read as a pattern, or any control character", () => {
    for (const name of ["a*b", "a?b", "a[b]", "a\\b", "a(b)", "a{b}", "a\x01b", "a\x7fb", "a\tb"])
      expect(fenceDenied(codex, new Map([...listing].map(([d, entries]) => [d, d === U ? [...entries, { name, directory: false }] : entries])))).toBeNull();
  });
});

describe("codexProfileArgs", () => {
  const profile = `${U}/agent-auth/profiles/codex`;
  const codex = { userData: U, profile, attachments: [`${U}/attachments`] };
  const denied = [{ path: `${U}/conversations`, directory: true }, { path: `${U}/agent-auth/profiles/cursor`, directory: true }];
  const sock = "/private/var/folders/x/T/doan-AbC123";
  it("defines Doan's two permission profiles and makes the read-only one the default", () => {
    const entries = `{"${U}/conversations"="deny","${U}/agent-auth/profiles/cursor"="deny","${profile}/config.toml"="deny","${profile}/hooks.json"="deny","${profile}/managed_config.toml"="deny","${profile}/.env"="deny","${profile}/rules"="deny","${profile}/AGENTS.md"="deny","${profile}/AGENTS.override.md"="deny","${profile}"="read","${U}/conversation-runtime.json"="read","${U}/attachments"="read"}`;
    const network = `network={enabled=true,unix_sockets={"${sock}"="allow"}}`;
    expect(codexProfileArgs(codex, denied, sock)).toEqual([
      "-c", 'default_permissions="doan"',
      "-c", `permissions.doan={extends=":read-only",filesystem=${entries},${network}}`,
      "-c", `permissions.doan-workspace={extends=":workspace",filesystem=${entries},${network}}`,
    ]);
  });
  // <CODEX_HOME>/.env sets every Codex process's environment, and config.toml's MCP servers and notify run outside the Codex
  // sandbox; an escalated command keeps only deny entries, so these files are denied rather than read-only.
  it("denies the profile's own settings files", () => {
    const text = codexProfileArgs(codex, denied, sock).join(" ");
    for (const file of ["config.toml", "hooks.json", "managed_config.toml", ".env", "rules"]) expect(text).toContain(`"${profile}/${file}"="deny"`);
  });
  // Codex writes its own state from its process, outside the command sandbox, so sandboxed commands need no write here.
  // Skills stay readable for shell tools, so an approved escalated command can write there: a known limit.
  it("keeps the whole profile readable and not writable to sandboxed commands", () => {
    const text = codexProfileArgs(codex, denied, sock).join(" ");
    expect(text).toContain(`"${profile}"="read"`);
    expect(text).not.toMatch(/="write"/);
    for (const dir of ["skills", "plugins", "tmp"]) expect(text).not.toContain(`"${profile}/${dir}"="deny"`);
  });
  // Codex loads <CODEX_HOME>/AGENTS.md (or AGENTS.override.md) as the person's own instructions in every later thread,
  // so an escalated command cannot write them either.
  it("denies the instruction files", () => {
    const text = codexProfileArgs(codex, denied, sock).join(" ");
    for (const file of ["AGENTS.md", "AGENTS.override.md"]) expect(text).toContain(`"${profile}/${file}"="deny"`);
  });
  // Conversations read their own runtime file, whose credential the app refuses for onboarding and removal; the
  // terminal's runtime.json stays closed.
  it("reopens the conversation runtime file and not runtime.json", () => {
    const text = codexProfileArgs(codex, denied, sock).join(" ");
    expect(text).toContain(`"${U}/conversation-runtime.json"="read"`);
    expect(text).not.toContain(`"${U}/runtime.json"`);
  });
  // Without network Codex opens no unix socket, for a sandboxed or an approved escalated command alike, so `doan`
  // could not reach the app.
  it("opens the network and the app socket's directory", () => {
    expect(codexProfileArgs(codex, denied, sock)[3]).toContain(`network={enabled=true,unix_sockets={"${sock}"="allow"}}`);
  });
  // An approved escalated command keeps a profile's deny entries but not the narrower read and write ones under them,
  // so a deny over userData as a whole would take runtime.json from `doan handoff`.
  it("denies neither userData nor an ancestor of an allowed path", () => {
    const text = codexProfileArgs(codex, denied, sock).join(" ");
    for (const path of [U, `${U}/agent-auth`, `${U}/agent-auth/profiles`, profile, `${U}/conversation-runtime.json`, `${U}/attachments`]) expect(text).not.toContain(`${JSON.stringify(path)}="deny"`);
  });
  it("escapes quotes and backslashes as TOML strings", () => {
    const odd = `/tmp/a"b\\c`;
    expect(codexProfileArgs({ userData: odd, profile: `${odd}/agent-auth/profiles/codex`, attachments: [`${odd}/attachments`] }, [{ path: `${odd}/conversations`, directory: true }], sock)[3]).toContain(`"/tmp/a\\"b\\\\c/conversations"="deny"`);
  });
});

describe("mechanisms", () => {
  it("fences Codex only in Full access", () => {
    expect(PERMISSION_MODES.map(codexMechanism)).toEqual(["codex-profile", "codex-profile", "codex-profile", "fence"]);
  });
  it("restarts a Codex server only when the send needs the other mechanism", () => {
    expect(codexRestart("codex-profile", "acceptEdits")).toBe(false);
    expect(codexRestart("codex-profile", "bypass")).toBe(true);
    expect(codexRestart("fence", "bypass")).toBe(false);
    expect(codexRestart("fence", "plan")).toBe(true);
    expect(codexRestart(undefined, "bypass")).toBe(false);
  });
});

describe("codexTurnPermission", () => {
  const defaults = { approvalPolicy: "untrusted", sandbox: { type: "readOnly" } };
  it("selects Doan's profile and never a sandboxPolicy on a profile server", () => {
    expect(codexTurnPermission("default", defaults, {}, "codex-profile")).toEqual({ approvalPolicy: "untrusted", permissions: "doan" });
    expect(codexTurnPermission("acceptEdits", defaults, { networkAccess: true }, "codex-profile")).toEqual({ approvalPolicy: "on-request", permissions: "doan-workspace" });
    expect(codexTurnPermission("plan", defaults, {}, "codex-profile")).toEqual({ approvalPolicy: "never", permissions: "doan" });
  });
  it("runs Full access as dangerFullAccess on a fenced server", () => {
    expect(codexTurnPermission("bypass", defaults, {}, "fence")).toEqual({ approvalPolicy: "never", sandboxPolicy: { type: "dangerFullAccess" } });
  });
  it("refuses a mode the server's mechanism does not hold", () => {
    expect(() => codexTurnPermission("bypass", defaults, {}, "codex-profile")).toThrow("session_unavailable");
    for (const mode of ["default", "acceptEdits", "plan"] as const) expect(() => codexTurnPermission(mode, defaults, {}, "fence")).toThrow("session_unavailable");
  });
  it("keeps today's legacy policy for a run with no fence", () => {
    expect(codexTurnPermission("acceptEdits", defaults, { networkAccess: true }, undefined)).toEqual({ approvalPolicy: "on-request", sandboxPolicy: { type: "workspaceWrite", networkAccess: true } });
    expect(codexTurnPermission("default", defaults, {}, undefined)).toEqual({ approvalPolicy: "untrusted", sandboxPolicy: { type: "readOnly" } });
  });
});

// cursor-agent creates its local worker's socket folder when acp starts. The expected paths are the ones the real CLI
// created (or was refused, the last one with EPERM).
describe("cursorWorkerDir", () => {
  const none = () => false;
  it("names the folder under .cursor/projects by the workspace slug when the path is short", () => {
    expect(cursorWorkerDir({ home: "/h", cwd: "/r/my.repo", tmpdir: "/var/folders/x/T/" }, none)).toBe("/h/.cursor/projects/r-my-repo");
  });
  it("cuts a long path at 83 characters and adds the first 7 hex digits of its SHA-256, as the CLI did", () => {
    expect(cursorWorkerDir({ home: "/private/tmp/acp-poc2-AJrUff/userData/agent-auth/profiles/cursor", cwd: "/private/tmp/acp-poc2-repo-a4DDvo", tmpdir: "/var/folders/x/T" }, none))
      .toBe("/private/tmp/acp-poc2-AJrUff/userData/agent-auth/profiles/cursor/.cursor/projects/p-988fa62");
    expect(cursorWorkerDir({ home: "/private/tmp/cfp-probe-VjCgW4/u2/agent-auth/profiles/cursor", cwd: "/private/tmp/cfp-probe-VjCgW4/repo", tmpdir: "/x" }, none))
      .toBe("/private/tmp/cfp-probe-VjCgW4/u2/agent-auth/profiles/cursor/.cursor/projects/privat-17deeb0");
  });
  it("falls back to the .cursor folder itself, then a sibling of it, when projects/ is over 83 characters", () => {
    expect(cursorWorkerDir({ home: "/private/tmp/cfp-probe-VjCgW4/userdata-sevencc/agent-auth/profiles/cursor", cwd: "/private/tmp/cfp-probe-VjCgW4/repo", tmpdir: "/x" }, none))
      .toBe("/private/tmp/cfp-probe-VjCgW4/userdata-sevencc/agent-auth/profiles/cursor/.cursor/p-2497593");
    expect(cursorWorkerDir({ home: "/private/tmp/cfp-probe-VjCgW4/userdata-seven-cha/agent-auth/profiles/cursor", cwd: "/private/tmp/cfp-probe-VjCgW4/repo", tmpdir: "/x" }, none))
      .toBe("/private/tmp/cfp-probe-VjCgW4/userdata-seven-cha/agent-auth/profiles/cursor/.cursor-cec846d");
  });
  it("falls back to TMPDIR, without its trailing slash, and then /tmp when .cursor is over 83 characters", () => {
    const home = "/Users/a-long-user-name/Library/Application Support/doan/agent-auth/profiles/cursor";
    expect(cursorWorkerDir({ home, cwd: "/r", tmpdir: "/var/folders/x/T/" }, none)).toBe("/var/folders/x/T/.cursor/r");
    expect(cursorWorkerDir({ home, cwd: "/r", tmpdir: undefined }, none)).toBe("/tmp/.cursor/r");
    expect(cursorWorkerDir({ home, cwd: "/r", tmpdir: `/${"t".repeat(90)}` }, none)).toBe("/tmp/.cursor/r");
  });
  it("names the workspace by the nearest folder above the working directory that holds .git, and never the file system root", () => {
    expect(cursorWorkerDir({ home: "/h", cwd: "/w/repo/app/src", tmpdir: "/t" }, path => path === "/w/repo/.git")).toBe("/h/.cursor/projects/w-repo");
    expect(cursorWorkerDir({ home: "/h", cwd: "/w/repo", tmpdir: "/t" }, path => path === "/.git")).toBe("/h/.cursor/projects/w-repo");
  });
});
