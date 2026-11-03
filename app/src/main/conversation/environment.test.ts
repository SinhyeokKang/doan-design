import { expect, test } from "vitest";
import { agentEnv } from "./environment";
import { DOCK, TERMINAL } from "../launchEnv.fixture";
test("marks app conversations even when an inherited value tries to disable the marker", () => {
  const result = agentEnv({ env: { DOAN_APP_CONVERSATION: "0" }, path: "/bin", configDir: "/profile" }, "codex", "/data/runtime.json", { root: "/repo", cwd: "/repo", configDir: "/profile" });
  expect(result?.env.DOAN_APP_CONVERSATION).toBe("1");
});
test("an agent gets the launchd environment, not the launching terminal's", () => {
  for (const runtime of ["claude", "codex"] as const) {
    const configDir = `/profile/${runtime}`;
    const result = agentEnv({ env: TERMINAL, path: "/shell/bin", configDir }, runtime, "/data/runtime.json", { root: "/repo", cwd: "/repo", configDir });
    expect(result?.env).toEqual({ ...DOCK, PATH: "/shell/bin", DOAN_RUNTIME: "/data/runtime.json", DOAN_APP_CONVERSATION: "1",
      [runtime === "claude" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME"]: configDir });
  }
});
