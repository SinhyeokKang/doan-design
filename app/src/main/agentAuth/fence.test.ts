import { describe, expect, it } from "vitest";
import { claudeDenyRules, claudeFenceSettings, claudeSandboxEnabled, codexMechanism, codexProfileArgs, codexRestart, codexTurnPermission, fenceArgs, fenceDenied, fencedCommand, fenceListingDirs, fencePolicy, resolveFencePaths, SANDBOX_EXEC, type FenceListing, type FencePaths } from "./fence";
import { PERMISSION_MODES } from "../conversation/permissionMode";
import type { Provider } from "./types";

// The policy text that passed real provider runs (Cursor, Antigravity, Copilot, and Claude and Codex fenced), byte for byte.
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
// A later run reads these as its settings, and Claude's or Codex's next run may start without the outer fence
// (Claude by its sandbox setting, Codex outside Full access): their hooks, MCP servers and notify then run outside
// any sandbox, so the agent must not plant them.
const CLAUDE_SETTINGS = `(deny file-write* (literal (param "PROVIDER_SETTINGS")) (subpath (param "PROVIDER_SKILLS")) (subpath (param "PROVIDER_AGENTS")) (subpath (param "PROVIDER_PLUGINS")) (subpath (param "PROVIDER_COMMANDS")))
`;
const CODEX_SETTINGS = `(deny file-write* (literal (param "CODEX_CONFIG")) (literal (param "CODEX_HOOKS")) (literal (param "CODEX_MANAGED")) (subpath (param "CODEX_RULES")) (subpath (param "CODEX_SKILLS")) (subpath (param "CODEX_PLUGINS")))
`;
const ANTIGRAVITY = `(allow file-read-metadata (literal (param "AGENT_RUNTIMES")))
(allow file-read* (subpath (param "AGENT_RUNTIME")))
(deny file-write* (subpath (param "SKILLS_CONFIG")) (subpath (param "SKILLS_CLI")))
`;

const U = "/Users/ada/Library/Application Support/doan";
const P = `${U}/agent-auth/profiles/claude`;
const paths = (over: Partial<FencePaths> = {}): FencePaths => ({ userData: U, profile: P, attachments: [], ...over });
const params = (args: readonly string[]) => {
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) if (args[i] === "-D") { const [name, ...rest] = args[i + 1]!.split("="); out[name!] = rest.join("="); }
  return out;
};

describe("fencePolicy", () => {
  it("is the passing text for Cursor and Copilot", () => {
    for (const provider of ["cursor", "copilot"] as Provider[]) expect(fencePolicy(provider)).toBe(BASE);
  });
  it("closes Claude's and Codex's own settings files to writes", () => {
    expect(fencePolicy("codex")).toBe(BASE + CODEX_SETTINGS);
  });
  it("adds the browser hook for Claude and the hook, agent runtime and skill-path deny for Antigravity", () => {
    expect(fencePolicy("claude")).toBe(BASE + HOOK + CLAUDE_SETTINGS);
    expect(fencePolicy("antigravity")).toBe(BASE + HOOK + ANTIGRAVITY);
  });
  it("is the same text with no pasted image or one", () => {
    for (const provider of ["cursor", "claude", "antigravity"] as Provider[]) expect(fencePolicy(provider, 1)).toBe(fencePolicy(provider, 0));
  });
  it("appends one read rule per further pasted image and leaves the rest unchanged", () => {
    expect(fencePolicy("claude", 3)).toBe(BASE + HOOK + CLAUDE_SETTINGS + `(allow file-read* (subpath (param "ATTACHMENTS_2")))
(allow file-read* (subpath (param "ATTACHMENTS_3")))
`);
  });
});

describe("fenceArgs", () => {
  it("passes the policy with -p and every path as a -D parameter in the order of the runs that passed", () => {
    const att = `${U}/attachments/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed`;
    expect(fenceArgs("claude", paths({ attachments: [att] }))).toEqual(["-p", BASE + HOOK + CLAUDE_SETTINGS,
      "-D", `USERDATA=${U}`, "-D", `AGENT_AUTH=${U}/agent-auth`, "-D", `PROFILES=${U}/agent-auth/profiles`, "-D", `PROFILE=${P}`,
      "-D", `RUNTIME=${U}/runtime.json`, "-D", `ATTACHMENTS=${att}`, "-D", `BROWSER_HOOK=${U}/agent-auth/browser-hook`, "-D", `PROVIDER_SETTINGS=${P}/settings.json`,
      "-D", `PROVIDER_SKILLS=${P}/skills`, "-D", `PROVIDER_AGENTS=${P}/agents`, "-D", `PROVIDER_PLUGINS=${P}/plugins`, "-D", `PROVIDER_COMMANDS=${P}/commands`]);
  });
  it("names Codex's settings files in its own profile", () => {
    const profile = `${U}/agent-auth/profiles/codex-7`;
    expect(params(fenceArgs("codex", { userData: U, profile, attachments: [`${U}/attachments`] }))).toMatchObject({
      CODEX_CONFIG: `${profile}/config.toml`, CODEX_HOOKS: `${profile}/hooks.json`, CODEX_MANAGED: `${profile}/managed_config.toml`, CODEX_RULES: `${profile}/rules`,
      CODEX_SKILLS: `${profile}/skills`, CODEX_PLUGINS: `${profile}/plugins` });
  });
  it("gives Antigravity its agent runtime and its own profile's skill paths", () => {
    const profile = `${U}/agent-auth/profiles/antigravity`;
    const args = fenceArgs("antigravity", paths({ profile }));
    expect(args[1]).toBe(fencePolicy("antigravity"));
    expect(params(args)).toMatchObject({ AGENT_RUNTIMES: `${U}/agent-runtimes`, AGENT_RUNTIME: `${U}/agent-runtimes/antigravity-acp`,
      SKILLS_CONFIG: `${profile}/.gemini/config/skills`, SKILLS_CLI: `${profile}/.gemini/antigravity-cli/skills` });
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
    expect(values.filter(v => v.startsWith(`${U}/agent-auth/profiles/`))).toEqual([P, P, `${P}/settings.json`, `${P}/skills`, `${P}/agents`, `${P}/plugins`, `${P}/commands`]);
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

describe("claudeSandboxEnabled", () => {
  const on = { sandbox: { enabled: true } }, off = { sandbox: { enabled: false } };
  it("is off with no setting anywhere", () => {
    expect(claudeSandboxEnabled({ user: undefined, project: undefined, local: undefined, managed: [] })).toBe(false);
  });
  it("lets local beat project and project beat user", () => {
    expect(claudeSandboxEnabled({ user: on, project: undefined, local: undefined, managed: [] })).toBe(true);
    expect(claudeSandboxEnabled({ user: on, project: off, local: undefined, managed: [] })).toBe(false);
    expect(claudeSandboxEnabled({ user: off, project: off, local: on, managed: [] })).toBe(true);
    expect(claudeSandboxEnabled({ user: undefined, project: on, local: off, managed: [] })).toBe(false);
  });
  it("lets managed beat every other source, a later drop-in beating an earlier one", () => {
    expect(claudeSandboxEnabled({ user: on, project: on, local: on, managed: [off] })).toBe(false);
    expect(claudeSandboxEnabled({ user: off, project: off, local: off, managed: [off, on] })).toBe(true);
    expect(claudeSandboxEnabled({ user: on, project: undefined, local: undefined, managed: [undefined, {}] })).toBe(true);
  });
  it("reads a non-boolean or malformed value as no setting", () => {
    expect(claudeSandboxEnabled({ user: on, project: { sandbox: { enabled: "false" } }, local: { sandbox: null }, managed: ["text", [1]] })).toBe(true);
  });
});

describe("fenceDenied", () => {
  const att = `${U}/attachments/0f4e`;
  const listing: FenceListing = new Map([
    [U, [{ name: "agent-auth", directory: true }, { name: "attachments", directory: true }, { name: "conversations", directory: true }, { name: "runtime.json", directory: false }, { name: "sessions.jsonl", directory: false }, { name: "agent-runtimes", directory: true }]],
    [`${U}/agent-auth`, [{ name: "profiles", directory: true }, { name: "vault", directory: true }, { name: "metadata.json", directory: false }, { name: "browser-hook", directory: false }]],
    [`${U}/agent-auth/profiles`, [{ name: "claude", directory: true }, { name: "codex", directory: true }, { name: "codex-7", directory: true }, { name: "cursor", directory: true }]],
    [`${U}/attachments`, [{ name: "0f4e", directory: true }, { name: "77aa", directory: true }]],
  ]);
  const dir = (path: string) => ({ path, directory: true }), file = (path: string) => ({ path, directory: false });
  it("lists the directories on the way to Claude's allowed paths, the attachment store only with a pasted image", () => {
    expect(fenceListingDirs("claude", paths({ attachments: [att] }))).toEqual([U, `${U}/agent-auth`, `${U}/agent-auth/profiles`, `${U}/attachments`]);
    expect(fenceListingDirs("claude", paths())).toEqual([U, `${U}/agent-auth`, `${U}/agent-auth/profiles`]);
  });
  it("denies every Claude entry off the way to the allowed paths", () => {
    expect(fenceDenied("claude", paths({ attachments: [att] }), listing)).toEqual([
      dir(`${U}/conversations`), file(`${U}/sessions.jsonl`), dir(`${U}/agent-runtimes`),
      dir(`${U}/agent-auth/vault`), file(`${U}/agent-auth/metadata.json`),
      dir(`${U}/agent-auth/profiles/codex`), dir(`${U}/agent-auth/profiles/codex-7`), dir(`${U}/agent-auth/profiles/cursor`),
      dir(`${U}/attachments/77aa`),
    ]);
  });
  it("denies the whole attachment store to a Claude turn with no pasted image", () => {
    expect(fenceDenied("claude", paths(), new Map([...listing].filter(([d]) => d !== `${U}/attachments`)))).toContainEqual(dir(`${U}/attachments`));
  });
  it("leaves Codex the whole attachment store and denies the browser hook it does not run", () => {
    const codex = { userData: U, profile: `${U}/agent-auth/profiles/codex`, attachments: [`${U}/attachments`] };
    expect(fenceListingDirs("codex", codex)).toEqual([U, `${U}/agent-auth`, `${U}/agent-auth/profiles`]);
    expect(fenceDenied("codex", codex, listing)).toEqual([
      dir(`${U}/conversations`), file(`${U}/sessions.jsonl`), dir(`${U}/agent-runtimes`),
      dir(`${U}/agent-auth/vault`), file(`${U}/agent-auth/metadata.json`), file(`${U}/agent-auth/browser-hook`),
      dir(`${U}/agent-auth/profiles/claude`), dir(`${U}/agent-auth/profiles/codex-7`), dir(`${U}/agent-auth/profiles/cursor`),
    ]);
  });
  it("never denies an allowed path or one of its ancestors", () => {
    const denied = fenceDenied("claude", paths({ attachments: [att] }), listing)!.map(e => e.path);
    for (const allowed of [U, P, att, `${U}/runtime.json`, `${U}/agent-auth/browser-hook`, `${U}/agent-auth/profiles`, `${U}/agent-auth`, `${U}/attachments`]) expect(denied).not.toContain(allowed);
  });
  it("refuses when an ancestor could not be listed", () => {
    expect(fenceDenied("claude", paths(), new Map([...listing].filter(([d]) => d !== `${U}/agent-auth`)))).toBeNull();
  });
  // TOML basic strings take no U+007F, which JSON.stringify leaves as it is.
  it("refuses a name a permission rule or profile entry would read as a pattern, or any control character", () => {
    for (const name of ["a*b", "a?b", "a[b]", "a\\b", "a(b)", "a{b}", "a\x01b", "a\x7fb", "a\tb"])
      expect(fenceDenied("claude", paths(), new Map([...listing].map(([d, entries]) => [d, d === U ? [...entries, { name, directory: false }] : entries])))).toBeNull();
  });
});

describe("claudeDenyRules", () => {
  it("writes directories with /** and files as they are, `//` starting an absolute path", () => {
    expect(claudeDenyRules([{ path: `${U}/conversations`, directory: true }, { path: `${U}/sessions.jsonl`, directory: false }])).toEqual([
      `Read(/${U}/conversations/**)`, `Edit(/${U}/conversations/**)`, `Read(/${U}/sessions.jsonl)`, `Edit(/${U}/sessions.jsonl)`]);
  });
});

describe("claudeFenceSettings", () => {
  const att = `${U}/attachments/0f4e`;
  const denied = [{ path: `${U}/conversations`, directory: true }, { path: `${U}/agent-auth/profiles/codex`, directory: true }];
  const settingsFiles = [{ path: `${P}/settings.json`, directory: false }, { path: `${P}/.claude.json`, directory: false }];
  const settingsDirs = ["skills", "agents", "plugins", "commands"].map(dir => `Edit(/${P}/${dir}/**)`);
  it("adds Doan's deny rules and filesystem limits, keeps the sandbox on and turns off running outside it", () => {
    expect(claudeFenceSettings(paths({ attachments: [att] }), denied)).toEqual({
      permissions: { deny: [...claudeDenyRules([...denied, ...settingsFiles]), ...settingsDirs] },
      sandbox: { enabled: true, allowUnsandboxedCommands: false, filesystem: {
        denyRead: [U], allowRead: [P, `${U}/runtime.json`, att, `${U}/agent-auth/browser-hook`],
        denyWrite: [`${U}/conversations`, `${U}/agent-auth/profiles/codex`, `${U}/runtime.json`, att, `${U}/agent-auth/browser-hook`, `${P}/settings.json`, `${P}/.claude.json`, `${P}/skills`, `${P}/agents`, `${P}/plugins`], allowWrite: [P] } },
    });
  });
  // Hooks, MCP servers and a sandbox switch in these files run outside any sandbox on a later turn with the sandbox on.
  it("keeps the agent's Bash and Edit tool off its own profile's settings files", () => {
    const settings = claudeFenceSettings(paths(), []);
    for (const file of ["settings.json", ".claude.json"]) {
      expect(settings.sandbox.filesystem.denyWrite).toContain(`${P}/${file}`);
      expect(settings.permissions.deny).toContain(`Edit(/${P}/${file})`);
    }
  });
  // A skill's or subagent's frontmatter hooks and a skills-dir plugin's hooks and MCP servers run outside the sandbox
  // too, and a skill added mid-session is picked up at once.
  it("keeps the agent's Bash and Edit tool off its own profile's skills, agents and plugins, which stay readable", () => {
    const settings = claudeFenceSettings(paths(), []);
    // commands/ is the older skill format and takes the same frontmatter, hooks included.
    for (const dir of ["skills", "agents", "plugins", "commands"]) {
      expect(settings.sandbox.filesystem.denyWrite).toContain(`${P}/${dir}`);
      expect(settings.permissions.deny).toContain(`Edit(/${P}/${dir}/**)`);
      expect(settings.permissions.deny).not.toContain(`Read(/${P}/${dir}/**)`);
    }
  });
  // Claude's sandbox blocks unix sockets, and allowUnsandboxedCommands false removed the way to run `doan` outside it,
  // so only the app socket's own directory is allowed (Claude Code 2.1.319, sandbox run; direct TCP stays blocked).
  it("allows the app socket's directory and no other network", () => {
    // The socket's own path, as the setting documents it, rather than its directory.
    expect(claudeFenceSettings(paths(), [], "/private/var/folders/x/T/doan-AbC/app.sock").sandbox.network).toEqual({ allowUnixSockets: ["/private/var/folders/x/T/doan-AbC/app.sock"] });
    expect(claudeFenceSettings(paths(), []).sandbox).not.toHaveProperty("network");
  });
  // Doan judged the sandbox on; the flag tier keeps it on when a user, project or local source it misread says off.
  it("turns the sandbox on in the flag tier", () => {
    expect(claudeFenceSettings(paths(), []).sandbox.enabled).toBe(true);
  });
  // A denyWrite path beats an allowWrite inside it (Claude Code 2.1.319, real sandbox run), so userData as a whole
  // kept Bash from writing its own profile.
  it("keeps the profile writable: no denyWrite path is the profile or one of its ancestors", () => {
    const { denyWrite } = claudeFenceSettings(paths({ attachments: [att] }), denied).sandbox.filesystem;
    for (const path of denyWrite) expect(P === path || P.startsWith(`${path}/`)).toBe(false);
  });
});

describe("codexProfileArgs", () => {
  const profile = `${U}/agent-auth/profiles/codex`;
  const codex = { userData: U, profile, attachments: [`${U}/attachments`] };
  const denied = [{ path: `${U}/conversations`, directory: true }, { path: `${U}/agent-auth/profiles/cursor`, directory: true }];
  const sock = "/private/var/folders/x/T/doan-AbC123";
  it("defines Doan's two permission profiles and makes the read-only one the default", () => {
    const entries = `{"${U}/conversations"="deny","${U}/agent-auth/profiles/cursor"="deny","${profile}/config.toml"="deny","${profile}/hooks.json"="deny","${profile}/managed_config.toml"="deny","${profile}/rules"="deny","${profile}"="write","${U}/runtime.json"="read","${U}/attachments"="read","${profile}/skills"="read","${profile}/plugins"="read"}`;
    const network = `network={enabled=true,unix_sockets={"${sock}"="allow"}}`;
    expect(codexProfileArgs(codex, denied, sock)).toEqual([
      "-c", 'default_permissions="doan"',
      "-c", `permissions.doan={extends=":read-only",filesystem=${entries},${network}}`,
      "-c", `permissions.doan-workspace={extends=":workspace",filesystem=${entries},${network}}`,
    ]);
  });
  // MCP servers and notify from config.toml run outside the Codex sandbox (codex-cli 0.166.0, probe), and an escalated
  // command keeps only deny entries, so the settings files are denied rather than read-only.
  // A skill's agents/openai.yaml can name MCP dependencies and a plugin can carry hooks and MCP servers.
  it("denies the profile's own settings files, skills and plugins", () => {
    const text = codexProfileArgs(codex, denied, sock).join(" ");
    for (const file of ["config.toml", "hooks.json", "managed_config.toml", "rules"]) expect(text).toContain(`"${profile}/${file}"="deny"`);
  });
  // The model opens a skill's SKILL.md with shell tools, so a deny kept the doan stub from sandboxed commands; read-only
  // still keeps them from writing there (codex sandbox probe). An approved escalated command keeps only deny entries,
  // so it can write there: a known limit.
  it("keeps the profile's skills and plugins readable but not writable to sandboxed commands", () => {
    const text = codexProfileArgs(codex, denied, sock).join(" ");
    for (const dir of ["skills", "plugins"]) { expect(text).toContain(`"${profile}/${dir}"="read"`); expect(text).not.toContain(`"${profile}/${dir}"="deny"`); }
  });
  // Without network Codex opens no unix socket, for a sandboxed or an approved escalated command alike, so `doan`
  // could not reach the app (user decision: network on, the app socket's directory allowed).
  it("opens the network and the app socket's directory", () => {
    expect(codexProfileArgs(codex, denied, sock)[3]).toContain(`network={enabled=true,unix_sockets={"${sock}"="allow"}}`);
  });
  // An approved escalated command keeps a profile's deny entries but not the narrower read and write ones under them
  // (codex-cli 0.166.0), so a deny over userData as a whole took runtime.json from `doan handoff`.
  it("denies neither userData nor an ancestor of an allowed path", () => {
    const text = codexProfileArgs(codex, denied, sock).join(" ");
    for (const path of [U, `${U}/agent-auth`, `${U}/agent-auth/profiles`, profile, `${U}/runtime.json`, `${U}/attachments`]) expect(text).not.toContain(`${JSON.stringify(path)}="deny"`);
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
