import { validProvider, type Provider } from "../main/agentAuth/types";

// The Settings page's categories (buzz-settings design 'LNB'). Kept apart from SettingsPage.tsx under a name that
// differs beyond capitalization (POSTMORTEM 2026-10-25 'A TS helper hid its TSX component on case-insensitive macOS').
export type SettingsSection = "agents" | "mcp" | "notifications" | "about";
export const SETTINGS_SECTIONS: readonly { id: SettingsSection; title: string }[] = [
  { id: "agents", title: "Agents" }, { id: "mcp", title: "MCP Connectors" }, { id: "notifications", title: "Notifications" }, { id: "about", title: "About" },
];
const IDS: readonly unknown[] = SETTINGS_SECTIONS.map(section => section.id);

// Also reads the old Settings window's tab: its Projects tab moved to the project menu, so it opens Agents.
export function parseSettingsSection(value: unknown): SettingsSection | null {
  if (value === "projects") return "agents";
  return IDS.includes(value) ? value as SettingsSection : null;
}

// MCP Connectors exists only while Claude Code or Codex is signed in to Doan (mcp-connectors spec 1). mcp is
// mcpConnectorsView's mcpAvailable: null until agent-auth is read, when a restored MCP Connectors is kept.
export function settingsSectionsShown(mcp: boolean): readonly { id: SettingsSection; title: string }[] {
  return mcp ? SETTINGS_SECTIONS : SETTINGS_SECTIONS.filter(section => section.id !== "mcp");
}
export function shownSettingsSection(section: SettingsSection, mcp: boolean | null): SettingsSection {
  return section === "mcp" && mcp === false ? "agents" : section;
}

// What openSettings is asked to show: the header tab and Settings… name nothing (the last section), Home's agent
// picker and the sign-in toast name Agents and a provider.
export interface SettingsTarget { section?: SettingsSection; provider?: Provider }

export function parseSettingsTarget(value: unknown): SettingsTarget | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  if (Object.keys(value).some(key => key !== "section" && key !== "provider")) return null;
  const { section, provider } = value as Record<string, unknown>;
  if (section !== undefined && (section === "projects" || parseSettingsSection(section) === null)) return null;
  if (provider === undefined) return section === undefined ? {} : { section: parseSettingsSection(section)! };
  if (!validProvider(provider) || (section !== undefined && section !== "agents")) return null;
  return { section: "agents", provider };
}

// Arriving puts focus on the section heading, or on the named provider's row group, which follows the provider
// between the Connected and Not connected sections (design '포커스').
export function settingsArrival(target: SettingsTarget, last: SettingsSection): { section: SettingsSection; focus: { kind: "heading" } | { kind: "provider"; provider: Provider } } {
  const section = target.section ?? last;
  return { section, focus: target.provider ? { kind: "provider", provider: target.provider } : { kind: "heading" } };
}

// A section that owns a confirmation or a write must not be unmounted by a target from outside (Settings…, Home's
// picker, a toast), or main's operation outlives its UI (POSTMORTEM 2026-10-25 'A forwarded Settings target discarded
// a pending setup confirmation'). The latest target waits and applies once the lock ends.
export class SettingsTargetQueue {
  private held: SettingsTarget | null = null;
  // The target to apply now, or null while it waits.
  offer(target: SettingsTarget, locked: boolean): SettingsTarget | null {
    this.held = locked ? target : null;
    return locked ? null : target;
  }
  release(): SettingsTarget | null {
    const target = this.held;
    this.held = null;
    return target;
  }
}
