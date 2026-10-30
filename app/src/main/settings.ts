import type { Provider } from "./agentAuth/types";

// Antigravity has no install page: Doan downloads its server itself.
export type ExternalTarget = "claude" | "codex" | "cursor" | "copilot";
// The Settings page's categories, and the target main sends with its open-Settings command.
export type SettingsSection = "agents" | "notifications" | "connections" | "about";
export interface SettingsPageTarget { section?: SettingsSection; provider?: Provider }

// macOS's Notifications pane; Open System Settings opens this and nothing else (buzz-settings P1, 2026-10-30:
// `openExternal` resolved and opened the pane).
export const NOTIFICATION_SETTINGS_URL = "x-apple.systempreferences:com.apple.Notifications-Settings.extension";

// The only pages `setup:open-external` opens; the renderer names one by enum.
// Checked 2026-10-25: the official install pages (the Codex CLI page is where
// developers.openai.com/codex/cli redirects).
export const INSTALL_URLS: Record<ExternalTarget, string> = {
  claude: "https://code.claude.com/docs/en/setup",
  codex: "https://learn.chatgpt.com/docs/codex/cli",
  // The providers' install pages also explain updating, so Install and Update share them (buzz-onboarding, 2026-10-29 user).
  cursor: "https://cursor.com/docs/cli/installation",
  copilot: "https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli",
};

function exact(value: unknown, required: string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return required.every(key => keys.includes(key)) && keys.every(key => required.includes(key));
}

export function parseExternalTarget(value: unknown): ExternalTarget | null {
  return exact(value, ["target"]) && typeof value.target === "string" && Object.hasOwn(INSTALL_URLS, value.target) ? value.target as ExternalTarget : null;
}
