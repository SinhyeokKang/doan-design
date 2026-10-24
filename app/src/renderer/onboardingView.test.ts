import { describe, expect, test } from "vitest";
import { wizardView, type WizardInput } from "./onboardingView";

const cli = { step: "cli", state: "missing", absoluteCli: true, translocated: false } as const;
const agent = { agent: "claude", detection: { kind: "found", path: "/bin/claude" }, mcp: "missing", skillLink: "missing", configPath: "/tmp/config" } as const;

describe("wizardView", () => {
  test("maps CLI states into human copy and install/replace actions", () => {
    expect(wizardView(cli).actions).toContainEqual({ id: "install", label: "Install", disabled: false });
    expect(wizardView({ ...cli, state: "ours" }).message).toBe("Installed");
    expect(wizardView({ ...cli, state: "link-other", target: "/other" }).message).toContain("Points to another copy: /other");
    expect(wizardView({ ...cli, state: "blocked", target: "/bin/doan" }).message).toContain("is in use by something else");
    expect(wizardView({ ...cli, absoluteCli: false }).actions.find((a) => a.id === "install")).toMatchObject({ disabled: true, reason: "This build has no bundled CLI. Set DOAN_CLI." });
    expect(wizardView({ ...cli, translocated: true }).message).toBe("Move doan to Applications, then open it again.");
  });
  test("keeps unknown shell guidance generic and exposes checking and failure", () => {
    const view = wizardView({ ...cli, pathMissing: true, rcFile: null });
    expect(view.detail).toContain("Add ~/.local/bin to PATH in your shell configuration, then choose Check Again.");
    expect(view.actions.some((a) => a.id === "copyPath")).toBe(false);
    expect(wizardView({ ...cli, pathMissing: true, rcFile: "~/.zshrc" }).actions.some((a) => a.id === "copyPath")).toBe(true);
    expect(wizardView({ ...cli, checking: true }).message).toBe("Checking…");
    expect(wizardView({ ...cli, error: "timed out" }).message).toBe("Couldn't check: timed out");
  });
  test("Connect requires detection, CLI readiness and known writable states", () => {
    const base = { step: "agents", cliReady: true, skill: "missing", agents: [agent] } as const;
    expect(wizardView(base).agents?.[0]).toMatchObject({ detection: "Found at /bin/claude", configPath: "/tmp/config", action: { id: "connect", disabled: false } });
    expect(wizardView({ ...base, cliReady: false }).agents?.[0]?.action).toMatchObject({ disabled: true, reason: "Install the CLI in step 1 first." });
    expect(wizardView({ ...base, agents: [{ ...agent, mcp: "unknown" }] }).agents?.[0]?.action).toMatchObject({ id: "checkAgain" });
    expect(wizardView({ ...base, agents: [{ ...agent, detection: { kind: "missing" } }] }).agents?.[0]).toMatchObject({ detection: "Not installed", action: null });
    expect(wizardView({ ...base, agents: [{ ...agent, detection: { kind: "error", reason: "timeout" } }] }).agents?.[0]?.detection).toBe("Couldn't check: timeout");
    expect(wizardView({ ...base, skill: "blocked" }).agents?.[0]?.action?.disabled).toBe(true);
    expect(wizardView({ ...base, agents: [{ ...agent, running: true }] }).agents?.[0]?.action?.disabled).toBe(true);
    expect(wizardView({ ...base, skill: "ours", agents: [{ ...agent, mcp: "ours", skillLink: "ours" }] }).agents?.[0]?.message).toBe("Connected. Start a new Claude Code session to use doan.");
    expect(wizardView({ ...base, agents: [{ ...agent, error: "MCP registration failed" }] }).agents?.[0]?.message).toBe("MCP registration failed");
  });
  test("project and prompt states expose guidance and clipboard completion states", () => {
    expect(wizardView({ step: "project", state: "none" }).actions[0]?.label).toBe("Open Project…");
    expect(wizardView({ step: "project", state: "ready" }).message).toBe("Already set up");
    expect(wizardView({ step: "project", state: "form", tokenCss: null }).detail).toContain("Without token CSS, doan check won't flag hardcoded colors.");
    expect(wizardView({ step: "project", state: "form", running: true }).actions.every((a) => a.disabled)).toBe(true);
    expect(wizardView({ step: "project", state: "form", error: "invalid config" }).message).toBe("invalid config");
    expect(wizardView({ step: "project", state: "ready", reroutedRoot: "/repo" }).message).toBe("This folder is inside /repo, which is already set up.");
    expect(wizardView({ step: "prompt", prompt: null, copy: "idle" }).message).toBe("Open a project first.");
    for (const [copy, label] of [["idle", "Copy"], ["copying", "Copying…"], ["copied", "Copied"], ["failed", "Retry copy"]] as const) {
      const input: WizardInput = { step: "prompt", prompt: "Use doan", copy };
      expect(wizardView(input).actions[0]).toMatchObject({ label, disabled: copy === "copying" });
    }
  });
});
