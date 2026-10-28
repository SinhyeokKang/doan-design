import { describe, expect, it } from "vitest";
import { providerEnv } from "./environment";
import type { Provider } from "./types";

const inherited = {
  HOME: "/Users/ada", USER: "ada", LOGNAME: "ada", SHELL: "/bin/zsh", TMPDIR: "/tmp/ada", LANG: "ko_KR.UTF-8", LC_ALL: "ko_KR.UTF-8", TERM: "xterm",
  HTTPS_PROXY: "http://proxy:8080", no_proxy: "localhost", NODE_EXTRA_CA_CERTS: "/etc/ca.pem",
  PATH: "/inherited/bin", DOAN_RUNTIME: "/inherited/runtime.json", XDG_CONFIG_HOME: "/Users/ada/.config",
  ANTHROPIC_API_KEY: "sk-ant-x", CLAUDE_CODE_OAUTH_TOKEN: "oauth-x", OPENAI_API_KEY: "sk-x", CURSOR_API_KEY: "cur-x", GEMINI_API_KEY: "gem-x",
  GH_TOKEN: "gho-x", GITHUB_TOKEN: "ghp-x", CLAUDE_CONFIG_DIR: "/Users/ada/.claude", CODEX_HOME: "/Users/ada/.codex",
  CLAUDE_CODE_SESSION_ID: "s", CODEX_THREAD_ID: "t", CODEX_SESSION_ID: "u", UNSET: undefined,
};
const input = (provider: Provider, over: Record<string, unknown> = {}) => ({ provider, inherited, path: "/verified/bin:/usr/bin", profileDir: "/data/profiles/" + provider, appRuntime: "/data/runtime.json", ...over });
const kept = { USER: "ada", LOGNAME: "ada", SHELL: "/bin/zsh", TMPDIR: "/tmp/ada", LANG: "ko_KR.UTF-8", LC_ALL: "ko_KR.UTF-8", TERM: "xterm",
  HTTPS_PROXY: "http://proxy:8080", no_proxy: "localhost", NODE_EXTRA_CA_CERTS: "/etc/ca.pem", PATH: "/verified/bin:/usr/bin", DOAN_RUNTIME: "/data/runtime.json" };

describe("provider child environment", () => {
  it("routes each provider to its dedicated profile and drops other credentials and session IDs", () => {
    expect(providerEnv(input("claude"))).toEqual({ ok: true, env: { ...kept, HOME: "/Users/ada", CLAUDE_CONFIG_DIR: "/data/profiles/claude" } });
    expect(providerEnv(input("codex"))).toEqual({ ok: true, env: { ...kept, HOME: "/Users/ada", CODEX_HOME: "/data/profiles/codex" } });
    for (const provider of ["cursor", "antigravity", "copilot"] as const) {
      expect(providerEnv(input(provider))).toEqual({ ok: true, env: { ...kept, HOME: `/data/profiles/${provider}` } });
    }
  });
  it("passes provider-required variables only to this child", () => {
    const result = providerEnv(input("cursor", { extra: { AGENT_CLI_CREDENTIAL_STORE: "file" } }));
    expect(result).toEqual({ ok: true, env: { ...kept, HOME: "/data/profiles/cursor", AGENT_CLI_CREDENTIAL_STORE: "file" } });
    expect(inherited).not.toHaveProperty("AGENT_CLI_CREDENTIAL_STORE");
  });
  it("refuses extras that would replace the routed path, runtime or profile", () => {
    for (const name of ["PATH", "DOAN_RUNTIME", "HOME", "CLAUDE_CONFIG_DIR", "CODEX_HOME"]) {
      expect(providerEnv(input("copilot", { extra: { [name]: "/elsewhere" } }))).toEqual({ ok: false, code: "reserved_extra" });
    }
    for (const extra of [{ "bad-name": "x" }, { lower: "x" }, { VALUE: "a\0b" }, { VALUE: 1 }]) {
      expect(providerEnv(input("copilot", { extra }))).toEqual({ ok: false, code: "invalid_extra" });
    }
  });
  it("names each invalid input explicitly", () => {
    expect(providerEnv(input("claude", { provider: "gemini" }))).toEqual({ ok: false, code: "invalid_provider" });
    expect(providerEnv(input("claude", { profileDir: "profiles/claude" }))).toEqual({ ok: false, code: "invalid_profile_dir" });
    expect(providerEnv(input("claude", { appRuntime: "runtime.json" }))).toEqual({ ok: false, code: "invalid_runtime" });
    for (const path of ["", "/bin\0x"]) expect(providerEnv(input("claude", { path }))).toEqual({ ok: false, code: "invalid_path" });
  });
});
