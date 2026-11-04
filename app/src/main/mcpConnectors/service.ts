import { randomUUID } from "node:crypto";
import { appendFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hookLinks as fileHookLinks, type AuthProcess, type Lease, type McpLogoutRequest, type Spawn } from "../agentAuth/manager";
import { PROVIDER_AUTH } from "../agentAuth/providers";
import type { AuthState, Provider, Readiness } from "../agentAuth/types";
import { mcpAuthLink } from "./authLink";
import { CONNECTOR_NAME, connectorName, connectorWithUrl, parseConnectorUrl, type UrlRejection } from "./names";
import { codexServerToml, mcpLogoutOutcome, mcpLogoutPlan, plaintextLeftovers, reconcilePlan, type McpLogoutInput } from "./plans";
import { connectorLabel, connectorLabels, MCP_PROVIDERS, PRESETS, type ConnectorServer, type McpProvider } from "./presets";
import { claudeConfigServers, codexConfigServers } from "./profileConfig";
import { connectorState, type CheckOutcome, type ConnectorView } from "./state";
import { codexMcpServers, parseClaudeMcpGet, parseClaudeMcpList, parseCodexMcpList, type ListedServer } from "./status";
import type { ConnectorStore } from "./store";

// Why an attempt failed, kept on its row until that row's next Connect, Retry or Cancel (spec 완료 조건 3).
// busy: the provider's sign-in or sign-out holds it. not_ready: the agent cannot run. pending_logout: the previous
// account's logout still failed. no_link: Claude's BROWSER hook received no acceptable link (a Claude `browser`
// setting). approval_timeout: the browser approval did not come in time. storage_failed: a plaintext token file.
export type McpFailure = "busy" | "not_ready" | "pending_logout" | "no_link" | "approval_timeout" | "storage_failed" | "failed" | "disconnect_failed";
export type McpRefusal = "invalid" | "busy" | "not_found" | "file_unreadable" | "stale" | "open_failed";
export type McpReply = { ok: true } | { ok: false; reason: McpRefusal };
// duplicate names the display label of the preset or server that already has the URL ("Already added as <name>.").
export type McpAddReply = { ok: true; name: string } | { ok: false; reason: UrlRejection | "duplicate" | "file_unreadable" | "write_failed"; name?: string };
// removable: no provider runs an attempt (Doan runs one provider CLI command chain per profile at a time).
export interface McpServerDto { name: string; label: string; url: string; preset: boolean; removable: boolean; removeFailed: boolean }
// link: the row's Claude sign-in has a link main can open again (open-link); the URL itself stays in main.
export interface McpRowDto { name: string; view: ConnectorView; failure: McpFailure | null; link: boolean }
// lastChanged: the server whose Connect, Disconnect or Remove last succeeded for this provider ("Applies from …").
export interface McpProviderDto { provider: McpProvider; rows: McpRowDto[]; lastChanged: string | null }
// One revision for the whole snapshot, as agent-auth: a reader keeps the newest. file: the connectors file; while it
// is broken or newer, URL servers cannot be added or removed, and a newer file's servers are not listed.
export interface McpSnapshot { revision: number; file: "ok" | "broken" | "newer"; servers: McpServerDto[]; providers: McpProviderDto[] }

// What conversations need from the connectors (batch BC): the generation a Codex runner compares before a turn to send
// config/mcpServer/reload, and the doan- name → label map for permission summaries.
export interface McpConversationFacts { generation(provider: McpProvider): number; labels(): Readonly<Record<string, string>> }

export interface McpAuth {
  acquire(provider: McpProvider, use: "mcp", added?: Record<string, string>): Promise<Lease>;
  state(provider: McpProvider): AuthState;
  // A command in a Doan-owned directory outside the profiles (a pending Codex logout's temporary CODEX_HOME).
  environment(provider: McpProvider, profileDir: string): Promise<{ command: string; env: Record<string, string> }>;
  // A committed replacement still running its MCP step: the new connection is not ready yet (BB review R1).
  settling(provider: McpProvider): boolean;
}
export interface McpServiceOptions {
  store: ConnectorStore; auth: McpAuth;
  readiness(provider: McpProvider): Readiness;
  // spawn: detached child processes (spawnAuthProcess); spawnPty: Claude's login, which needs a terminal.
  spawn: Spawn; spawnPty: Spawn;
  openExternal(url: string): Promise<void>;
  publish(snapshot: McpSnapshot): void;
  hookLinks?: typeof fileHookLinks;
  // Prepended to every command, as agentAuth does: Codex's keyring arguments.
  baseArgs?: Record<McpProvider, string[]>;
  tmpdir?: string; newId?: () => string;
  limits?: Partial<typeof LIMITS>;
}

const LIMITS = {
  // A status, list, add, logout or remove command; status commands health-check servers over the network.
  commandMs: 20_000,
  // The hook link arrives about a second after the login starts (P4b); none this long after means the CLI will not
  // hand one over (a Claude `browser` setting overrides BROWSER).
  linkMs: 30_000,
  // How long the browser approval may take after the link (spec 완료 조건 4); also Codex's hang guard.
  approvalMs: 5 * 60_000,
};
const QUIT_WAIT_MS = 5000;
const OUTPUT_LIMIT = 256 * 1024;
const CODEX_CALLBACK_TIMEOUT = /timed out waiting for OAuth callback/i;

class Failure extends Error { constructor(readonly code: McpFailure, detail?: string) { super(detail ?? code); } }
interface Owner { stopped: boolean; processes: Set<AuthProcess> }
interface Attempt extends Owner { id: string; name: string; kind: "connect" | "disconnect" | "remove"; providers: McpProvider[]; link: string | null; onLink: ((url: string) => void) | null }
interface Run { code: number | null; output: string; timedOut: boolean }
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const tail = (text: string) => text.trim().slice(-2000);
const key = (provider: McpProvider, name: string) => `${provider}\0${name}`;
const mcpProvider = (provider: Provider): provider is McpProvider => MCP_PROVIDERS.some(p => p === provider);
const COMMANDS = {
  claude: {
    list: ["mcp", "list"], get: (name: string) => ["mcp", "get", name],
    add: (server: ConnectorServer) => ["mcp", "add", "--transport", "http", "--scope", "user", server.name, server.url],
    login: (name: string) => ["mcp", "login", name], logout: (name: string) => ["mcp", "logout", name], remove: (name: string) => ["mcp", "remove", name, "-s", "user"],
  },
  codex: {
    list: ["mcp", "list", "--json"], get: () => null,
    add: (server: ConnectorServer) => ["mcp", "add", server.name, "--url", server.url],
    login: (name: string) => ["mcp", "login", name], logout: (name: string) => ["mcp", "logout", name], remove: (name: string) => ["mcp", "remove", name],
  },
} as const;

// Settings > MCP Connectors in main (mcp-connectors design 'service'): Doan keeps the server list; each provider CLI
// registers, signs in and stores tokens in the provider's Doan profile. One attempt per provider at a time, and every
// command chain on a profile runs in that provider's queue, so two CLI processes never rewrite one profile's config.
export class McpService implements McpConversationFacts {
  private revision = 0;
  private attempts = new Map<McpProvider, Attempt>();
  private reads = new Map<McpProvider, Owner>();
  private checks = new Map<McpProvider, Map<string, CheckOutcome>>();
  private failures = new Map<string, McpFailure>();
  private removeFailures = new Set<string>();
  private generations = new Map<McpProvider, number>();
  private lastChanged = new Map<McpProvider, string>();
  private readyKeys = new Map<McpProvider, string | null>();
  private again = new Set<McpProvider>();
  // Pending retries and reconciles, owned like attempts and reads so a sign-out (stopProvider) and quit stop them.
  private chores = new Map<McpProvider, Set<Owner>>();
  private started = new Set<McpProvider>();
  private queues = new Map<McpProvider, Promise<void>>();
  private pending = new Set<Promise<unknown>>();
  // Each attempt's and read's own work, for a stop that waits for exactly those.
  private works = new Map<Owner, Promise<unknown>>();
  private closed = false;
  private readonly limits: typeof LIMITS;
  private readonly hookLinks: typeof fileHookLinks;
  private readonly baseArgs: Record<McpProvider, string[]>;
  private readonly newId: () => string;
  constructor(private readonly options: McpServiceOptions) {
    this.limits = { ...LIMITS, ...options.limits };
    this.hookLinks = options.hookLinks ?? fileHookLinks;
    this.baseArgs = options.baseArgs ?? { claude: PROVIDER_AUTH.claude.args, codex: PROVIDER_AUTH.codex.args };
    this.newId = options.newId ?? randomUUID;
  }

  snapshot(): McpSnapshot {
    const read = this.options.store.connectors();
    const servers = this.servers();
    const everConnected = read.ok ? read.file.everConnected : {};
    const busy = this.attempts.size > 0;
    return {
      revision: this.revision, file: read.ok ? "ok" : read.code,
      servers: servers.map(server => ({
        name: server.name, label: server.label, url: server.url, preset: server.preset,
        removable: !server.preset && read.ok && !busy, removeFailed: this.removeFailures.has(server.name),
      })),
      providers: MCP_PROVIDERS.map(provider => {
        const readiness = this.options.readiness(provider), attempt = this.attempts.get(provider) ?? null;
        return {
          provider, lastChanged: this.lastChanged.get(provider) ?? null,
          rows: servers.map(server => ({
            name: server.name,
            view: connectorState({
              name: server.name, readiness, attempt: attempt && { name: attempt.name, kind: attempt.kind },
              check: { reading: this.reads.has(provider), last: this.checks.get(provider)?.get(server.name) ?? null },
              everConnected: (everConnected[server.name] ?? []).includes(provider),
              // Records and an unknown (unreadable or newer) pending file alike.
              blocked: this.options.store.blocked(provider, server.name),
            }),
            failure: this.failures.get(key(provider, server.name)) ?? null,
            link: attempt?.name === server.name && attempt.link !== null,
          })),
        };
      }),
    };
  }
  generation(provider: McpProvider): number { return this.generations.get(provider) ?? 0; }
  labels(): Record<string, string> { const read = this.options.store.connectors(); return connectorLabels(read.ok ? read.file.servers : []); }

  // Status commands use the network, so they run on entering the page, after attempts, on Retry and when the
  // provider's sign-in changes, never on a timer (design '상태 판정').
  refresh(provider?: McpProvider): void {
    for (const each of provider ? [provider] : MCP_PROVIDERS) {
      if (this.closed || !this.options.readiness(each).ready) continue;
      // A read already running may have started before the change this refresh is for: read once more after it.
      if (this.reads.has(each)) { this.again.add(each); continue; }
      const owner: Owner = { stopped: false, processes: new Set() };
      this.reads.set(each, owner);
      this.work(owner, this.read(each, owner));
    }
  }

  add(text: string): McpAddReply {
    const parsed = parseConnectorUrl(text);
    if (!parsed.ok) return { ok: false, reason: parsed.reason };
    const read = this.options.store.connectors();
    if (!read.ok) return { ok: false, reason: "file_unreadable" };
    const taken = connectorWithUrl(parsed.url, read.file.servers);
    if (taken) return { ok: false, reason: "duplicate", name: this.servers().find(server => server.name === taken)?.label ?? taken };
    const name = connectorName(parsed.url, read.file.servers.map(server => server.name));
    const written = this.options.store.patch({ add: { name, url: parsed.url } });
    if (!written.ok) return { ok: false, reason: written.code === "write_failed" ? "write_failed" : "file_unreadable" };
    this.changed();
    return { ok: true, name };
  }

  connect(provider: McpProvider, name: string): McpReply {
    const server = this.servers().find(each => each.name === name);
    if (this.closed || this.attempts.has(provider)) return { ok: false, reason: "busy" };
    if (!server) return { ok: false, reason: "not_found" };
    this.failures.delete(key(provider, name));
    const attempt = this.begin([provider], name, "connect");
    this.work(attempt, this.exclusive(provider, () => this.connectFlow(provider, server, attempt)).finally(() => this.end(attempt)));
    return { ok: true };
  }

  disconnect(provider: McpProvider, name: string): McpReply {
    const server = this.servers().find(each => each.name === name);
    if (this.closed || this.attempts.has(provider)) return { ok: false, reason: "busy" };
    if (!server) return { ok: false, reason: "not_found" };
    this.failures.delete(key(provider, name));
    const attempt = this.begin([provider], name, "disconnect");
    this.work(attempt, this.exclusive(provider, () => this.disconnectFlow(provider, server, attempt)).finally(() => this.end(attempt)));
    return { ok: true };
  }

  // Only a URL server, and only while no provider runs an attempt: Remove touches every provider's profile.
  remove(name: string): McpReply {
    const read = this.options.store.connectors();
    if (!read.ok) return { ok: false, reason: "file_unreadable" };
    if (!read.file.servers.some(server => server.name === name)) return { ok: false, reason: "not_found" };
    if (this.closed || this.attempts.size) return { ok: false, reason: "busy" };
    this.removeFailures.delete(name);
    const attempt = this.begin([...MCP_PROVIDERS], name, "remove");
    this.work(attempt, this.removeFlow(name, attempt).finally(() => this.end(attempt)));
    return { ok: true };
  }

  // A cancelled Connect returns to its previous state without a failure (spec 완료 조건 4).
  cancel(provider: McpProvider, name: string): McpReply {
    const attempt = this.attempts.get(provider);
    if (!attempt || attempt.kind !== "connect" || attempt.name !== name) return { ok: false, reason: "stale" };
    this.failures.delete(key(provider, name));
    this.stop(attempt);
    this.changed();
    return { ok: true };
  }

  async openLink(provider: McpProvider, name: string): Promise<McpReply> {
    const attempt = this.attempts.get(provider);
    if (!attempt || attempt.kind !== "connect" || attempt.name !== name || attempt.stopped || !attempt.link) return { ok: false, reason: "stale" };
    try { await this.options.openExternal(attempt.link); return { ok: true }; } catch { return { ok: false, reason: "open_failed" }; }
  }

  // Every agent-auth change. A provider whose verified connection is new (app start, sign-in, replacement commit)
  // retries its pending logouts, reconciles and reads its statuses; one that lost its connection forgets its reads.
  authChanged(provider: Provider): void {
    if (!mcpProvider(provider)) return;
    const state = this.options.auth.state(provider);
    // A Claude without a Doan connection signed out with `claude auth logout`, which clears its MCP tokens (P4).
    if (provider === "claude" && !state.connection) this.options.store.clearProvider("claude");
    // Codex keys MCP tokens by server name and URL only, so its pending logouts are retried at start whether or not
    // Codex is signed in (design 'agentAuth').
    if (!this.started.has(provider)) {
      this.started.add(provider);
      if (provider === "codex" && !this.closed) this.chore(provider, owner => this.retryPending(provider, null, owner).then(() => {}));
    }
    const ready = state.connection && state.verified && !state.expired && !this.options.auth.settling(provider) ? state.connection.connectionId : null;
    if (ready !== (this.readyKeys.get(provider) ?? null)) {
      this.readyKeys.set(provider, ready);
      if (!state.connection) this.checks.delete(provider);
      if (ready && !this.closed) this.chore(provider, owner => this.prepare(provider, owner), () => this.refresh(provider));
    }
    this.changed();
  }

  // agentAuth's stopRuns for a sign-out or replacement: the provider's attempt and reads stop without a failure, and
  // their leases go once their process groups are gone (the drain waits for them).
  async stopProvider(provider: Provider): Promise<void> {
    if (!mcpProvider(provider)) return;
    const owners = [this.attempts.get(provider), this.reads.get(provider), ...this.chores.get(provider) ?? []].filter(owner => owner !== undefined);
    for (const owner of owners) this.stop(owner);
    await Promise.allSettled(owners.map(owner => this.works.get(owner)));
  }

  // Quit cancels every attempt and read, which then write nothing (design '프로세스 정리').
  async quit(): Promise<void> {
    this.closed = true;
    for (const attempt of new Set(this.attempts.values())) this.stop(attempt);
    for (const read of this.reads.values()) this.stop(read);
    for (const chores of this.chores.values()) for (const chore of chores) this.stop(chore);
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([this.idle(), new Promise(resolve => { timer = setTimeout(resolve, QUIT_WAIT_MS); timer.unref?.(); })]);
    clearTimeout(timer);
  }

  // Resolves when no attempt, read or retry is running.
  async idle(): Promise<void> { while (this.pending.size) await Promise.allSettled([...this.pending]); }

  // The MCP step of an agent-auth sign-out or committed replacement (agentAuth AuthManager mcpLogout). Server names
  // come from the provider's own list, so a broken connectors file does not stop the logout. Codex keys tokens by
  // name and URL hash, not profile: a failed logout is recorded and blocks that server's Connect until a retry succeeds.
  async logoutForAuth(provider: Provider, request: McpLogoutRequest): Promise<{ failed: string[] }> {
    if (!mcpProvider(provider)) return { failed: [] };
    // A Claude sign-out (its `auth logout` clears MCP tokens) or a same-account replacement logs nothing out, so the
    // provider's list (a network health check) is not read.
    const probe: McpLogoutInput = { provider, kind: request.kind, previousAccountId: request.previousAccountId, nextAccountId: request.nextAccountId, servers: [PRESETS[0]!.name] };
    if (!mcpLogoutPlan(probe).logout.length) return { failed: [] };
    try {
      return await this.exclusive(provider, async () => {
        const listed = await this.listForAuth(provider, request);
        // A server the list shows signed out holds no token to log out; its logout could fail for that alone and
        // leave a record that blocks Connect without cause. Unknown statuses are logged out.
        const holding = listed.servers.filter(server => server.authenticated !== false);
        const input: McpLogoutInput = { provider, kind: request.kind, previousAccountId: request.previousAccountId, nextAccountId: request.nextAccountId, servers: holding.map(server => server.name) };
        const failed: string[] = [];
        for (const name of mcpLogoutPlan(input).logout) {
          const run = await request.run(COMMANDS[provider].logout(name)).catch(() => null);
          if (run?.code !== 0) { failed.push(name); console.error(`doan: ${provider} MCP logout of ${name} failed${run ? `: ${tail(run.stderr || run.stdout)}` : ""}`); }
        }
        const outcome = mcpLogoutOutcome(input, failed);
        const url = (name: string) => listed.servers.find(server => server.name === name)?.url ?? this.servers().find(server => server.name === name)?.url ?? null;
        // The staging profile also takes the signed-out registrations, which have nothing to carry over.
        const register = [...outcome.register, ...listed.servers.filter(server => server.authenticated === false && CONNECTOR_NAME.test(server.name)).map(server => server.name)];
        if (request.staging && register.length) {
          const blocks = register.flatMap(name => { const at = url(name); return at ? [codexServerToml(name, at)] : []; });
          try { appendFileSync(join(request.staging, "config.toml"), `\n${blocks.join("\n")}`, { mode: 0o600 }); }
          catch (error) { console.error(`doan: ${provider} MCP servers could not be registered in the new profile`, message(error)); }
        }
        for (const name of outcome.unregister) {
          const run = await request.run(COMMANDS[provider].remove(name)).catch(() => null);
          if (run?.code !== 0) console.error(`doan: ${provider} MCP server ${name} could not be unregistered after its logout failed`);
        }
        const records = outcome.record.flatMap(name => { const at = url(name); return at ? [{ provider, name, url: at }] : []; });
        if (records.length) this.options.store.record(records);
        return { failed };
      });
    } finally {
      this.changed();
      this.refresh(provider);
    }
  }

  // Without the provider's list, the targets are the union of the profile config's doan- servers (when that read
  // succeeds; it also finds servers the connectors file does not know) and every server Doan knows (presets, and the
  // file's servers when it can be read), so a config parser miss can never drop a known server (BB review round 3).
  // Each is logged out; a failure is recorded and blocks Connect until a retry succeeds. The config is read before
  // the provider logout, which may change the profile.
  private async listForAuth(provider: McpProvider, request: McpLogoutRequest): Promise<{ servers: ListedServer[] }> {
    const run = await request.run([...COMMANDS[provider].list]).catch(() => null);
    const servers = run && (provider === "claude" ? parseClaudeMcpList(run.stdout, run.code ?? -1) : run.code === 0 ? codexMcpServers(run.stdout) : null);
    if (servers) return { servers };
    const config = this.profileServers(provider, request.profileDir) ?? [];
    const known = this.servers().filter(server => !config.some(entry => entry.name === server.name)).map(server => ({ name: server.name, url: server.url, authenticated: null }));
    console.error(`doan: ${provider} MCP servers could not be listed for the logout; logging out ${config.length} from the profile's config and every known server`);
    return { servers: [...config, ...known] };
  }
  private profileServers(provider: McpProvider, profileDir: string): ListedServer[] | null {
    let text: string;
    try { text = readFileSync(join(profileDir, provider === "codex" ? "config.toml" : ".claude.json"), "utf8"); } catch { return null; }
    return provider === "codex" ? codexConfigServers(text) : claudeConfigServers(text);
  }

  private async connectFlow(provider: McpProvider, server: ConnectorServer, attempt: Attempt): Promise<void> {
    try {
      // Connect retries the previous account's logout first and connects only after it succeeded (spec 완료 조건 8).
      if (this.options.store.blocked(provider, server.name) && !await this.retryPending(provider, server.name, attempt, server.url)) throw new Failure("pending_logout");
      if (attempt.stopped) return;
      const hooked = provider === "claude" ? this.hookLinks(raw => this.linked(attempt, raw)) : null;
      try {
        const lease = await this.lease(provider, hooked?.env);
        try {
          if (provider === "claude") await this.claudeConnect(attempt, lease, server);
          else await this.codexConnect(attempt, lease, server);
        } finally { await lease.release(); }
      } finally { hooked?.close(); }
      if (attempt.stopped || this.closed) return;
      this.options.store.patch({ everConnected: { name: server.name, provider, value: true } });
      this.succeeded(provider, server.name);
    } catch (error) { this.failed(provider, server.name, attempt, error); }
  }

  private async claudeConnect(attempt: Attempt, lease: Lease, server: ConnectorServer): Promise<void> {
    const registered = await this.registered(attempt, lease, "claude", server.name);
    if (attempt.stopped) return;
    if (registered === null) throw new Failure("failed", "the registration could not be read");
    if (!registered) await this.must(attempt, lease, "claude", COMMANDS.claude.add(server));
    if (attempt.stopped) return;
    let missing = false, late = false, approval: ReturnType<typeof setTimeout> | undefined;
    const link = setTimeout(() => { missing = true; this.stop(attempt, false); }, this.limits.linkMs);
    attempt.onLink = () => {
      clearTimeout(link);
      approval ??= setTimeout(() => { late = true; this.stop(attempt, false); }, this.limits.approvalMs);
    };
    let login: Run, plaintext: boolean | null = false;
    try { login = await this.run(attempt, lease, "claude", COMMANDS.claude.login(server.name), { timeoutMs: null, pty: true }); }
    finally {
      clearTimeout(link); clearTimeout(approval); attempt.onLink = null;
      // After the login's group is gone, on every way out (success, failure, limit, cancel): Claude falls back to a
      // plaintext file when the keychain fails, and none may stay behind (spec 완료 조건 5, BB review R3).
      plaintext = this.scrubPlaintext(lease.profileDir);
    }
    if (attempt.stopped) return;
    if (missing) throw new Failure("no_link", "the browser hook received no acceptable link");
    if (late) throw new Failure("approval_timeout", "the browser approval did not come in time");
    if (login.code !== 0) throw new Failure("failed", `login exited ${login.code}: ${tail(login.output)}`);
    if (plaintext === null) throw new Failure("failed", "the profile could not be checked for a plaintext credential file");
    if (plaintext) throw new Failure("storage_failed", "the CLI wrote a plaintext credential file");
    const after = await this.claudeGet(attempt, lease, server.name);
    if (attempt.stopped) return;
    if (!after.ok || !after.facts.registered || !after.facts.authenticated) throw new Failure("failed", "status after sign-in is not connected");
  }

  // `codex mcp add` starts the OAuth sign-in itself and opens the default browser; Doan opens nothing for Codex
  // (POSTMORTEM 2026-10-30 'Doan opened a second Codex sign-in page'). A registration left by a cancelled or failed
  // first attempt signs in with `codex mcp login` (design '등록 정합').
  private async codexConnect(attempt: Attempt, lease: Lease, server: ConnectorServer): Promise<void> {
    const listed = await this.codexList(attempt, lease);
    if (attempt.stopped) return;
    if (!listed) throw new Failure("failed", "the server list could not be read");
    const args = listed.some(each => each.name === server.name) ? COMMANDS.codex.login(server.name) : COMMANDS.codex.add(server);
    const login = await this.run(attempt, lease, "codex", args, { timeoutMs: this.limits.approvalMs });
    if (attempt.stopped) return;
    if (login.timedOut || CODEX_CALLBACK_TIMEOUT.test(login.output)) throw new Failure("approval_timeout", tail(login.output));
    if (login.code !== 0) throw new Failure("failed", `login exited ${login.code}: ${tail(login.output)}`);
    const after = await this.codexList(attempt, lease);
    if (attempt.stopped) return;
    if (after?.find(each => each.name === server.name)?.authenticated !== true) throw new Failure("failed", "status after sign-in is not connected");
  }

  private async disconnectFlow(provider: McpProvider, server: ConnectorServer, attempt: Attempt): Promise<void> {
    try {
      const lease = await this.lease(provider);
      try {
        const run = await this.run(attempt, lease, provider, COMMANDS[provider].logout(server.name), { timeoutMs: this.limits.commandMs });
        if (attempt.stopped) return;
        if (run.code !== 0) throw new Failure("disconnect_failed", `logout exited ${run.code}: ${tail(run.output)}`);
      } finally { await lease.release(); }
      if (attempt.stopped || this.closed) return;
      // A disconnected row is Not connected, not Reconnect needed (user decision, orch.md).
      this.options.store.patch({ everConnected: { name: server.name, provider, value: false } });
      this.succeeded(provider, server.name);
    } catch (error) {
      this.failed(provider, server.name, attempt, error instanceof Failure && error.code !== "busy" && error.code !== "not_ready" ? new Failure("disconnect_failed", error.message) : error);
    }
  }

  // Logout before remove at every provider holding the registration (Codex builds the keychain key from the
  // registered URL), and only then out of the file. A provider without a Doan connection is left to its reconcile.
  private async removeFlow(name: string, attempt: Attempt): Promise<void> {
    const touched: McpProvider[] = [];
    try {
      for (const provider of MCP_PROVIDERS) {
        if (!this.options.auth.state(provider).connection) continue;
        const removed = await this.exclusive(provider, async () => {
          const lease = await this.lease(provider);
          try { return await this.unregister(attempt, lease, provider, name, true); } finally { await lease.release(); }
        });
        if (attempt.stopped) return;
        if (removed) touched.push(provider);
      }
      if (attempt.stopped || this.closed) return;
      const written = this.options.store.patch({ remove: name });
      if (!written.ok) throw new Failure("failed", `the connectors file was not written (${written.code})`);
      for (const provider of MCP_PROVIDERS) { this.failures.delete(key(provider, name)); this.checks.get(provider)?.delete(name); }
      for (const provider of touched) this.succeeded(provider, name);
    } catch (error) {
      if (attempt.stopped || this.closed) return;
      console.error(`doan: ${name} could not be removed: ${message(error)}`);
      this.removeFailures.add(name);
    }
  }

  // Logs a registered server out and removes it from one profile; false when it was not registered. strict: any
  // failure throws; otherwise (reconcile) failures are logged and the next server goes on.
  private async unregister(owner: Owner, lease: Lease, provider: McpProvider, name: string, strict: boolean): Promise<boolean> {
    const registered = await this.registered(owner, lease, provider, name);
    if (owner.stopped) return false;
    if (registered === null) { if (strict) throw new Failure("failed", "the registration could not be read"); return false; }
    if (!registered) return false;
    const logout = await this.run(owner, lease, provider, COMMANDS[provider].logout(name), { timeoutMs: this.limits.commandMs });
    if (owner.stopped) return false;
    // A logout can fail because there was no token to clear; only a server still signed in must not be removed.
    if (logout.code !== 0) {
      const after = await this.facts(owner, lease, provider, name);
      if (!after.ok || (after.facts.registered && after.facts.authenticated)) {
        if (strict) throw new Failure("failed", `logout exited ${logout.code}: ${tail(logout.output)}`);
        console.error(`doan: ${provider} MCP logout of ${name} failed; its registration is kept`);
        return false;
      }
    }
    const removed = await this.run(owner, lease, provider, COMMANDS[provider].remove(name), { timeoutMs: this.limits.commandMs });
    if (owner.stopped) return false;
    if (removed.code !== 0) {
      if (strict) throw new Failure("failed", `remove exited ${removed.code}: ${tail(removed.output)}`);
      console.error(`doan: ${provider} MCP server ${name} could not be removed`);
      return false;
    }
    return true;
  }

  // Pending logouts first (app start retries them, design 'agentAuth'), then the doan- registrations neither a preset
  // nor in the file (design '등록 정합' reconcile). Both quietly wait for the next ready moment on any failure.
  private async prepare(provider: McpProvider, owner: Owner): Promise<void> {
    try { await this.retryPending(provider, null, owner); } catch (error) { console.error(`doan: ${provider} pending MCP logouts were not retried: ${message(error)}`); }
    if (owner.stopped || this.closed) return;
    try {
      const lease = await this.lease(provider);
      try {
        if (owner.stopped || this.closed) return;
        const listed = provider === "claude" ? await this.claudeList(owner, lease) : await this.codexList(owner, lease);
        if (owner.stopped || this.closed) return;
        if (!listed) throw new Error("the server list could not be read");
        for (const name of reconcilePlan(listed.map(server => server.name), this.options.store.connectors())) {
          if (owner.stopped || this.closed) return;
          await this.unregister(owner, lease, provider, name, false);
        }
      } finally { await lease.release(); }
    } catch (error) { console.error(`doan: ${provider} MCP registrations were not reconciled: ${message(error)}`); }
  }

  // Whether every pending logout asked for (one server, or all of the provider's) is gone. Claude's token sits in the
  // live profile's keychain item; Codex's keychain key is the name and URL hash only, so its logout runs in a
  // temporary CODEX_HOME holding just that server: the profile it was registered in may be gone (design 'agentAuth').
  // url: the server's URL, for a block the store holds without a record (an unreadable pending file).
  private async retryPending(provider: McpProvider, only: string | null, owner: Owner, url?: string): Promise<boolean> {
    let entries = this.options.store.pending(provider).filter(entry => only === null || entry.name === only);
    if (!entries.length && only !== null && url && this.options.store.blocked(provider, only)) entries = [{ provider, name: only, url }];
    if (!entries.length) return true;
    try {
      for (const entry of entries) {
        if (owner.stopped || this.closed) return false;
        const done = provider === "codex" ? await this.codexPendingLogout(owner, entry.name, entry.url) : await this.claudePendingLogout(owner, entry.name);
        // A command whose attempt was stopped meanwhile never edits the pending file, even when it succeeded.
        if (owner.stopped || this.closed) return false;
        if (done) this.options.store.clear(provider, entry.name);
        else console.error(`doan: ${provider} pending MCP logout of ${entry.name} failed again`);
      }
    } finally { this.changed(); }
    return entries.every(entry => !this.options.store.blocked(provider, entry.name));
  }
  // Done when the logout exited 0, or when the server reads as holding no token afterwards: a logout can fail just
  // because there is nothing to clear, and that must not block Connect for good.
  private async claudePendingLogout(owner: Owner, name: string): Promise<boolean> {
    const lease = await this.lease("claude");
    try {
      const run = await this.run(owner, lease, "claude", COMMANDS.claude.logout(name), { timeoutMs: this.limits.commandMs });
      if (owner.stopped || run.code === 0) return run.code === 0;
      const after = await this.claudeGet(owner, lease, name);
      return after.ok && (!after.facts.registered || !after.facts.authenticated);
    } finally { await lease.release(); }
  }
  private async codexPendingLogout(owner: Owner, name: string, url: string): Promise<boolean> {
    const home = mkdtempSync(join(this.options.tmpdir ?? tmpdir(), "doan-mcp-logout-"));
    try {
      writeFileSync(join(home, "config.toml"), codexServerToml(name, url), { mode: 0o600 });
      const launched = await this.options.auth.environment("codex", home);
      if (owner.stopped || this.closed) return false;
      const lease: Lease = { ...launched, profileDir: home, release: async () => {} };
      const run = await this.run(owner, lease, "codex", COMMANDS.codex.logout(name), { timeoutMs: this.limits.commandMs });
      if (owner.stopped || run.code === 0) return run.code === 0;
      // The keychain entry is keyed by name and URL, so this home's list says whether a token is left.
      const after = (await this.codexRead(owner, lease))(name);
      return after.ok && (!after.facts.registered || !after.facts.authenticated);
    } finally { rmSync(home, { recursive: true, force: true }); }
  }

  private async read(provider: McpProvider, owner: Owner): Promise<void> {
    this.changed();
    try {
      let lease: Lease;
      try { lease = await this.options.auth.acquire(provider, "mcp"); } catch { return; }
      try {
        const names = this.servers().map(server => server.name);
        const outcomes = new Map<string, CheckOutcome>();
        if (provider === "codex") {
          // One list answers for every server.
          const read = await this.codexRead(owner, lease);
          for (const name of names) outcomes.set(name, read(name));
        } else await Promise.all(names.map(async name => { outcomes.set(name, await this.claudeGet(owner, lease, name)); }));
        if (owner.stopped || this.closed) return;
        this.checks.set(provider, outcomes);
      } finally { await lease.release(); }
    } finally {
      if (this.reads.get(provider) === owner) this.reads.delete(provider);
      this.changed();
      if (this.again.delete(provider)) this.refresh(provider);
    }
  }

  // Whether a server is registered, whatever its sign-in reads as: an unreachable server's health check gives Claude
  // no status Doan knows, and it must still be removable. null: unreadable.
  private async registered(owner: Owner, lease: Lease, provider: McpProvider, name: string): Promise<boolean | null> {
    if (provider === "codex") { const listed = await this.codexList(owner, lease); return listed ? listed.some(server => server.name === name) : null; }
    const run = await this.run(owner, lease, "claude", COMMANDS.claude.get(name), { timeoutMs: this.limits.commandMs });
    const facts = run.timedOut ? null : parseClaudeMcpGet(name, run.output, run.code ?? -1);
    if (facts) return facts.registered;
    return run.code === 0 && run.output.split("\n")[0]?.trim() === `${name}:` ? true : null;
  }

  // One server's status: `claude mcp get <name>`, or its entry in `codex mcp list --json`.
  private async facts(owner: Owner, lease: Lease, provider: McpProvider, name: string): Promise<CheckOutcome> {
    return provider === "claude" ? this.claudeGet(owner, lease, name) : (await this.codexRead(owner, lease))(name);
  }
  private async codexRead(owner: Owner, lease: Lease): Promise<(name: string) => CheckOutcome> {
    const run = await this.run(owner, lease, "codex", [...COMMANDS.codex.list], { timeoutMs: this.limits.commandMs });
    const servers = run.timedOut || run.code !== 0 ? null : parseCodexMcpList(run.output);
    return name => {
      if (run.timedOut) return { ok: false, reason: "timeout" };
      if (run.code !== 0) return { ok: false, reason: "failed" };
      if (!servers) return { ok: false, reason: "unparsable" };
      const found = servers.find(server => server.name === name);
      if (!found) return { ok: true, facts: { registered: false } };
      return found.authenticated === null ? { ok: false, reason: "unparsable" } : { ok: true, facts: { registered: true, authenticated: found.authenticated } };
    };
  }
  private async claudeGet(owner: Owner, lease: Lease, name: string): Promise<CheckOutcome> {
    const run = await this.run(owner, lease, "claude", COMMANDS.claude.get(name), { timeoutMs: this.limits.commandMs });
    if (run.timedOut) return { ok: false, reason: "timeout" };
    const facts = parseClaudeMcpGet(name, run.output, run.code ?? -1);
    if (facts) return { ok: true, facts };
    return { ok: false, reason: run.code === 0 || run.code === 1 ? "unparsable" : "failed" };
  }
  private async codexList(owner: Owner, lease: Lease): Promise<{ name: string; authenticated: boolean | null }[] | null> {
    const run = await this.run(owner, lease, "codex", [...COMMANDS.codex.list], { timeoutMs: this.limits.commandMs });
    return run.code === 0 ? parseCodexMcpList(run.output) : null;
  }
  private async claudeList(owner: Owner, lease: Lease): Promise<ListedServer[] | null> {
    const run = await this.run(owner, lease, "claude", [...COMMANDS.claude.list], { timeoutMs: this.limits.commandMs });
    return parseClaudeMcpList(run.output, run.code ?? -1);
  }
  private async must(owner: Owner, lease: Lease, provider: McpProvider, args: string[]): Promise<void> {
    const run = await this.run(owner, lease, provider, args, { timeoutMs: this.limits.commandMs });
    if (!owner.stopped && run.code !== 0) throw new Failure("failed", `${args.slice(0, 2).join(" ")} exited ${run.code}: ${tail(run.output)}`);
  }

  // Resolves only after the process group is gone, so no result outruns its process.
  private async run(owner: Owner, lease: Lease, provider: McpProvider, args: readonly string[], options: { timeoutMs: number | null; pty?: boolean; env?: Record<string, string>; cwd?: string }): Promise<Run> {
    if (owner.stopped) return { code: null, output: "", timedOut: false };
    const spawn = options.pty ? this.options.spawnPty : this.options.spawn;
    let child: AuthProcess;
    try { child = spawn(lease.command, [...this.baseArgs[provider], ...args], { cwd: options.cwd ?? lease.profileDir, env: options.env ?? lease.env }); }
    catch (error) { throw new Failure("failed", `the CLI could not be started: ${message(error)}`); }
    owner.processes.add(child);
    if (owner.stopped) child.stop();
    let output = "", timedOut = false, timer: ReturnType<typeof setTimeout> | undefined;
    child.onOutput(text => { if (output.length < OUTPUT_LIMIT) output += text; });
    if (options.timeoutMs !== null) timer = setTimeout(() => { timedOut = true; child.stop(); }, options.timeoutMs);
    try {
      const code = await child.exit;
      await child.gone;
      return { code, output, timedOut };
    } finally { clearTimeout(timer); owner.processes.delete(child); }
  }

  private async lease(provider: McpProvider, added?: Record<string, string>): Promise<Lease> {
    try { return await this.options.auth.acquire(provider, "mcp", added); }
    catch (error) { throw new Failure(message(error) === "busy" ? "busy" : "not_ready", message(error)); }
  }

  // The hook's link, checked by mcpAuthLink (main fixes every URL it opens); the first accepted link opens in the
  // browser, a later one replaces it for Open again.
  private linked(attempt: Attempt, raw: string): void {
    const url = mcpAuthLink(raw);
    if (!url) { console.error(`doan: an MCP sign-in ignored a browser-hook link it does not accept: ${describeLink(raw)}`); return; }
    if (attempt.stopped || attempt.link === url) return;
    const first = attempt.link === null;
    attempt.link = url;
    attempt.onLink?.(url);
    if (first) void this.options.openExternal(url).catch(error => console.error("doan: the MCP sign-in link could not be opened", message(error)));
    this.changed();
  }

  // Background work on one provider's profile, in its queue and owned so stopProvider and quit stop and reap it.
  private chore(provider: McpProvider, step: (owner: Owner) => Promise<void>, then?: () => void): void {
    const owner: Owner = { stopped: false, processes: new Set() };
    const chores = this.chores.get(provider) ?? new Set<Owner>();
    chores.add(owner); this.chores.set(provider, chores);
    this.work(owner, this.exclusive(provider, async () => { if (!owner.stopped && !this.closed) await step(owner); })
      .catch(error => console.error(`doan: ${provider} MCP background work failed: ${message(error)}`))
      .finally(() => { chores.delete(owner); if (!owner.stopped && !this.closed) then?.(); }));
  }
  // Removes a plaintext credential file by path only, never reading it. true: one was there; null: unknown.
  private scrubPlaintext(profileDir: string): boolean | null {
    let files: string[];
    try { files = readdirSync(profileDir); } catch { return null; }
    const leftovers = plaintextLeftovers("claude", files);
    for (const file of leftovers) rmSync(join(profileDir, file), { force: true });
    return leftovers.length > 0;
  }

  private begin(providers: McpProvider[], name: string, kind: Attempt["kind"]): Attempt {
    const attempt: Attempt = { id: this.newId(), name, kind, providers, stopped: false, processes: new Set(), link: null, onLink: null };
    for (const provider of providers) this.attempts.set(provider, attempt);
    this.changed();
    return attempt;
  }
  private end(attempt: Attempt): void {
    for (const provider of attempt.providers) if (this.attempts.get(provider) === attempt) this.attempts.delete(provider);
    this.changed();
    for (const provider of attempt.providers) this.refresh(provider);
  }
  private succeeded(provider: McpProvider, name: string): void {
    this.generations.set(provider, this.generation(provider) + 1);
    this.lastChanged.set(provider, name);
  }
  private failed(provider: McpProvider, name: string, attempt: Attempt, error: unknown): void {
    if (attempt.stopped || this.closed) return;
    const code = error instanceof Failure ? error.code : "failed";
    console.error(`doan: ${provider} MCP ${attempt.kind} of ${name} failed (${code}): ${message(error)}`);
    this.failures.set(key(provider, name), code);
  }
  // cancel: a person's or a sign-out's stop, which ends the attempt silently; the attempt's own limits stop only its
  // processes and report their reason.
  private stop(owner: Owner, cancel = true): void {
    if (cancel) owner.stopped = true;
    for (const child of owner.processes) child.stop();
  }
  private servers(): (ConnectorServer & { label: string; preset: boolean })[] {
    const read = this.options.store.connectors();
    return [...PRESETS.map(preset => ({ ...preset, preset: true })), ...(read.ok ? read.file.servers.map(server => ({ ...server, label: connectorLabel(server), preset: false })) : [])];
  }
  private exclusive<T>(provider: McpProvider, step: () => Promise<T>): Promise<T> {
    const next = (this.queues.get(provider) ?? Promise.resolve()).then(step);
    this.queues.set(provider, next.then(() => {}, () => {}));
    return next;
  }
  private work(owner: Owner, work: Promise<unknown>): void {
    this.works.set(owner, this.track(work));
    void work.finally(() => this.works.delete(owner)).catch(() => {});
  }
  private track<T>(work: Promise<T>): Promise<T> {
    this.pending.add(work);
    void work.finally(() => this.pending.delete(work)).catch(() => {});
    return work;
  }
  private changed(): void {
    this.revision += 1;
    this.options.publish(this.snapshot());
  }
}

// Query values (state, challenge) stay out of the log.
function describeLink(raw: string): string {
  if (!URL.canParse(raw)) return "(not a URL)";
  const url = new URL(raw);
  return `${url.origin}${url.pathname} params=[${[...url.searchParams.keys()].join(",")}]`;
}
