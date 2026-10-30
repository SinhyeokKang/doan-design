import { expect, test } from "vitest";
import { INSTALL_URLS, parseExternalTarget } from "./settings";

test("only the two fixed install pages can be opened", () => {
  expect(parseExternalTarget({ target: "claude" })).toBe("claude");
  expect(parseExternalTarget({ target: "codex" })).toBe("codex");
  expect(parseExternalTarget({ target: "cursor" })).toBe("cursor");
  expect(parseExternalTarget({ target: "copilot" })).toBe("copilot");
  // Doan downloads Antigravity's server itself, so it has no install page.
  expect(parseExternalTarget({ target: "antigravity" })).toBeNull();
  for (const bad of [{ target: "https://example.com" }, { target: "claude", url: "x" }, "claude", null, { target: "toString" }]) expect(parseExternalTarget(bad)).toBeNull();
  expect(INSTALL_URLS).toEqual({
    claude: "https://code.claude.com/docs/en/setup", codex: "https://learn.chatgpt.com/docs/codex/cli",
    cursor: "https://cursor.com/docs/cli/installation",
    copilot: "https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli",
  });
});
