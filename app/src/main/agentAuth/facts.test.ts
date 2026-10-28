import { describe, expect, it, vi } from "vitest";
import { sharedShell, toolFacts, type FactsDeps } from "./facts";
import type { Provider } from "./types";

const CLI = "/Applications/doan.app/Contents/Resources/bin/doan";
function deps(over: Partial<FactsDeps> = {}): FactsDeps & { run: ReturnType<typeof vi.fn> } {
  const run = vi.fn(async (command: string) => ({ exitCode: 0, timedOut: false, stdout: ({ "/bin/claude": "2.1.312 (Claude Code)", "/bin/codex": "codex-cli 0.164.0", "/bin/cursor-agent": "2026.10.22-27dcf5f", "/bin/copilot": "GitHub Copilot CLI 1.0.105." } as Record<string, string>)[command] ?? "", stderr: "" }));
  return { shell: async () => ({ ok: true, path: "/bin" }), run, executable: path => path === CLI || ["/bin/claude", "/bin/codex", "/bin/cursor-agent", "/bin/copilot"].includes(path), inherited: { HOME: "/Users/ada", PATH: "/usr/bin" }, cli: CLI, ...over } as FactsDeps & { run: ReturnType<typeof vi.fn> };
}

describe("tool facts", () => {
  it.each([
    ["claude", "2.1.312", "2.1.311 (Claude Code)", "2.1.400 (Claude Code)", "2.1.400"],
    ["codex", "0.164.0", "codex-cli 0.162.0", "codex-cli 0.170.0", "0.170.0"],
    ["cursor", "2026.10.22-27dcf5f", "2026.10.21-0aa1111", "2026.10.23-0aa1111", "2026.10.23-0aa1111"],
    ["copilot", "1.0.105", "GitHub Copilot CLI 1.0.104.", "GitHub Copilot CLI 1.0.106.", "1.0.106"],
  ] as const)("finds %s on the login shell's PATH and accepts its minimum version or newer", async (provider, installed, older, newer, newerInstalled) => {
    const d = deps();
    expect(await toolFacts(provider, d)).toEqual({ cli: "found", version: "supported", installed, tools: "ready" });
    expect(d.run.mock.calls[0]!.slice(1, 3)).toEqual([["--version"], { HOME: "/Users/ada", PATH: "/bin" }]);
    d.run.mockResolvedValueOnce({ exitCode: 0, timedOut: false, stdout: older, stderr: "" });
    expect(await toolFacts(provider, d)).toMatchObject({ version: "unsupported" });
    d.run.mockResolvedValueOnce({ exitCode: 0, timedOut: false, stdout: newer, stderr: "" });
    expect(await toolFacts(provider, d)).toEqual({ cli: "found", version: "supported", installed: newerInstalled, tools: "ready" });
  });
  it("reads a version answer without a version as unknown, not as a reason to update", async () => {
    const d = deps(); d.run.mockResolvedValueOnce({ exitCode: 0, timedOut: false, stdout: "Claude Code", stderr: "" });
    expect(await toolFacts("claude", d)).toEqual({ cli: "found", version: "unknown", tools: "ready" });
  });
  it("separates a missing CLI, an unanswered version and an unreadable shell", async () => {
    expect(await toolFacts("cursor", deps({ executable: path => path === CLI }))).toEqual({ cli: "missing", version: "unknown", tools: "ready" });
    const timedOut = deps(); timedOut.run.mockResolvedValue({ exitCode: null, timedOut: true, stdout: "", stderr: "" });
    expect(await toolFacts("codex", timedOut)).toMatchObject({ cli: "found", version: "unknown" });
    expect(await toolFacts("claude", deps({ shell: async () => ({ ok: false, reason: "no shell" }) }))).toMatchObject({ cli: "found", version: "unknown" });
    const thrown = deps(); thrown.run.mockRejectedValue(new Error("spawn EACCES"));
    expect(await toolFacts("copilot", thrown)).toMatchObject({ version: "unknown" });
  });
  it("treats Antigravity's server as doan's own sha-pinned install, without running or downloading it", async () => {
    const d = deps({ shell: vi.fn() });
    expect(await toolFacts("antigravity", d)).toEqual({ cli: "found", version: "supported", tools: "ready" });
    expect(d.run).not.toHaveBeenCalled(); expect(d.shell).not.toHaveBeenCalled();
  });
  it("reports doan's own tools missing without its bundled executable", async () => {
    expect(await toolFacts("claude", deps({ cli: "doan" }))).toMatchObject({ tools: "missing" });
    expect(await toolFacts("claude", deps({ executable: path => path === "/bin/claude" }))).toMatchObject({ tools: "missing" });
  });
  it("shares one login shell run between concurrent probes and starts a new one afterwards", async () => {
    let finish!: () => void;
    const probe = vi.fn(() => new Promise<{ ok: true; path: string }>(resolve => { finish = () => resolve({ ok: true, path: "/bin" }); }));
    const shell = sharedShell(probe);
    const first = Promise.all([shell(), shell(), shell()]);
    expect(probe).toHaveBeenCalledTimes(1);
    finish(); expect(await first).toEqual([{ ok: true, path: "/bin" }, { ok: true, path: "/bin" }, { ok: true, path: "/bin" }]);
    const later = shell(); finish(); await later;
    expect(probe).toHaveBeenCalledTimes(2);
  });
});
