import { expect, test } from "vitest";
import { agentEnv } from "./environment";
test("marks app conversations even when an inherited value tries to disable the marker", () => {
  const result = agentEnv({ env: { DOAN_APP_CONVERSATION: "0" }, path: "/bin", configDir: "/profile" }, "codex", "/data/runtime.json", { root: "/repo", cwd: "/repo", configDir: "/profile" });
  expect(result?.env.DOAN_APP_CONVERSATION).toBe("1");
});
