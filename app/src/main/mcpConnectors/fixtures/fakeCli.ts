import type { AuthProcess, Spawn } from "../../agentAuth/manager";
import type { McpProvider } from "../presets";

// A stand-in for `claude mcp` and `codex mcp` in a Doan profile, answering in the PoC output formats (fixtures/).
// Logins stay open until a test approves, refuses or stops them; any command can be made to fail or hang.

export class FakeProcess implements AuthProcess {
  private listeners: ((text: string, stream?: "stderr") => void)[] = [];
  stopped = false;
  private exitWith!: (code: number | null) => void;
  private goneWith!: () => void;
  readonly exit = new Promise<number | null>(resolve => { this.exitWith = resolve; });
  readonly gone = new Promise<void>(resolve => { this.goneWith = resolve; });
  constructor(readonly provider: McpProvider, readonly command: string, readonly args: string[], readonly env: Record<string, string>,
    readonly cwd: string, readonly pty: boolean, private readonly onStop: (p: FakeProcess) => void) {}
  onOutput(listener: (text: string, stream?: "stderr") => void): void { this.listeners.push(listener); }
  print(text: string, stream?: "stderr"): void { for (const listener of this.listeners) listener(text, stream); }
  finish(code: number | null): void { this.exitWith(code); this.goneWith(); }
  stop(): void { if (this.stopped) return; this.stopped = true; this.onStop(this); }
  // The command after the provider's base arguments.
  get sub(): string[] { return this.args.slice(this.args.indexOf("mcp")); }
}

interface Server { url: string; auth: boolean }
export const BASE_ARGS: Record<McpProvider, string[]> = { claude: [], codex: ["-c", 'mcp_oauth_credentials_store="keyring"'] };

export class FakeCli {
  readonly registered: Record<McpProvider, Map<string, Server>> = { claude: new Map(), codex: new Map() };
  readonly processes: FakeProcess[] = [];
  // "<provider> <verb> <name>" (or "<provider> <verb>" for list) of commands that exit 1, or never exit until stopped.
  readonly failing = new Set<string>();
  readonly hanging = new Set<string>();
  // Output a login prints before it exits on its own (Codex's callback timeout).
  loginOutput = "";
  readonly spawn: Spawn = (command, args, options) => this.start(command, args, options, false);
  readonly spawnPty: Spawn = (command, args, options) => this.start(command, args, options, true);

  logins(provider?: McpProvider): FakeProcess[] {
    return this.processes.filter(p => (!provider || p.provider === provider) && ["login", "add"].includes(p.sub[1]!) && this.isLogin(p) && !p.stopped && !this.done.has(p));
  }
  commands(provider?: McpProvider): string[][] { return this.processes.filter(p => !provider || p.provider === provider).map(p => p.sub); }
  approve(p: FakeProcess): void { const server = this.server(p); if (server) server.auth = true; this.close(p, 0); }
  refuse(p: FakeProcess, code = 1): void { this.close(p, code); }

  private readonly done = new Set<FakeProcess>();
  private isLogin(p: FakeProcess): boolean { return p.sub[1] === "login" || (p.provider === "codex" && p.sub[1] === "add"); }
  private server(p: FakeProcess): Server | undefined { return this.registered[p.provider].get(p.sub[2]!); }
  private close(p: FakeProcess, code: number | null): void { if (this.done.has(p)) return; this.done.add(p); p.finish(code); }

  private start(command: string, args: string[], options: { cwd: string; env: Record<string, string> }, pty: boolean): FakeProcess {
    const provider: McpProvider = command.endsWith("codex") ? "codex" : "claude";
    const p = new FakeProcess(provider, command, args, options.env, options.cwd, pty, stopped => this.close(stopped, null));
    this.processes.push(p);
    queueMicrotask(() => this.answer(p));
    return p;
  }

  private answer(p: FakeProcess): void {
    const verb = p.sub[1]!;
    // Claude's add puts its options before the name.
    const name = (p.provider === "claude" && verb === "add" ? p.sub[p.sub.indexOf("user") + 1] : p.sub[2]) ?? "";
    const key = `${p.provider} ${verb}${verb === "list" ? "" : ` ${name}`}`;
    const servers = this.registered[p.provider];
    if (this.hanging.has(key)) return;
    if (this.failing.has(key)) { p.print("Error: something failed\n", "stderr"); return this.close(p, 1); }
    if (p.provider === "codex" && verb === "add") {
      // `codex mcp add` registers and then starts the OAuth sign-in itself.
      servers.set(name, { url: p.sub[p.sub.indexOf("--url") + 1]!, auth: false });
      if (this.loginOutput) { p.print(this.loginOutput); return this.close(p, 1); }
      return;
    }
    switch (verb) {
      case "get": {
        const server = servers.get(name);
        if (!server) { p.print(`No MCP server named "${name}". Run \`claude mcp add\` to add one.\n`); return this.close(p, 1); }
        p.print(`${name}:\n  Scope: User config (available in all your projects)\n  Status: ${server.auth ? "✔ Connected" : "! Needs authentication"}\n  Type: http\n  URL: ${server.url}\n`);
        return this.close(p, 0);
      }
      case "list": {
        if (p.provider === "claude") {
          const lines = [...servers].map(([n, s]) => `${n}: ${s.url} (HTTP) - ${s.auth ? "✔ Connected" : "! Needs authentication"}`);
          p.print(lines.length ? `Checking MCP server health…\n\n${lines.join("\n")}\n` : "No MCP servers configured. Use `claude mcp add` to add a server.\n");
        } else {
          p.print(JSON.stringify([...servers].map(([n, s]) => ({ name: n, enabled: true, transport: { type: "streamable_http", url: s.url }, auth_status: s.auth ? "o_auth" : "not_logged_in" }))));
        }
        return this.close(p, 0);
      }
      case "add": {
        const at = p.sub.indexOf("user");
        servers.set(p.sub[at + 1]!, { url: p.sub[at + 2]!, auth: false });
        return this.close(p, 0);
      }
      case "login": {
        if (!servers.has(name)) { p.print(`No MCP server named "${name}"\n`, "stderr"); return this.close(p, 1); }
        if (this.loginOutput) { p.print(this.loginOutput); return this.close(p, 1); }
        return;
      }
      case "logout": {
        const server = servers.get(name);
        if (!server) return this.close(p, 1);
        server.auth = false;
        return this.close(p, 0);
      }
      case "remove": {
        if (!servers.delete(name)) return this.close(p, 1);
        return this.close(p, 0);
      }
    }
    this.close(p, 2);
  }
}
