import { useEffect, useRef, useState, type ReactNode } from "react";
import { SettingsAbout } from "./SettingsAbout";
import { SettingsAgents, type SettingsAgentsProps } from "./SettingsAgents";
import { SettingsConnections } from "./SettingsConnections";
import { SettingsNotifications } from "./SettingsNotifications";
import { SETTINGS_SECTIONS, type settingsArrival, type SettingsSection } from "./settingsSections";

// What App asks the page to focus on arrival; seq makes a repeated arrival (⌘, again) distinct.
export interface SettingsArrival { focus: ReturnType<typeof settingsArrival>["focus"]; seq: number }

const LEADS: Record<SettingsSection, string> = {
  agents: "Doan signs in to each agent with its own connection, separate from your terminal. One account per agent. To let the agent in your terminal use Doan, see Connections.",
  notifications: "macOS notifications for when an agent needs you while you work in another app.",
  connections: "Your agents reach Doan through these three. Each row says whether that works right now. Signing in for conversations on Home is in Agents.",
  about: "Versions on this Mac, for checking an update or reporting a problem.",
};

// The Settings page (buzz-settings design '본문'): the shell's header and sidebar around Home's white panel, which
// scrolls a 48rem column of the category's title, lead and sections. App owns navigation, the lock and the queue;
// a category only reports whether it holds a confirmation or a write.
export function SettingsPage({ header, sidebar, section, arrival, onState, agents }: {
  header: ReactNode; sidebar: ReactNode; section: SettingsSection; arrival: SettingsArrival | null;
  onState(report: { locked: boolean }): void;
  // Notifications saves the same preferences snapshot as Agents' New conversations.
  agents: Omit<SettingsAgentsProps, "arrival" | "onLock">;
}) {
  const heading = useRef<HTMLHeadingElement | null>(null);
  // The header's actions slot (Check Again, Copy details): the category that owns the action renders it there.
  const [actions, setActions] = useState<HTMLDivElement | null>(null);
  const onLock = (locked: boolean) => onState({ locked });
  // Arrival and ⌘, on the page focus the title; a category picked in the sidebar brings no arrival, so focus stays on
  // its row (design '포커스'). A frame later, after the menu or picker that led here has returned its own focus.
  const arrived = useRef(0);
  useEffect(() => {
    if (!arrival || arrival.seq === arrived.current) return;
    arrived.current = arrival.seq;
    if (arrival.focus.kind === "heading") requestAnimationFrame(() => heading.current?.focus());
  });
  const title = SETTINGS_SECTIONS.find(item => item.id === section)?.title ?? "";
  const provider = arrival?.focus.kind === "provider" ? { provider: arrival.focus.provider, seq: arrival.seq } : null;
  return <div className="app-shell home-shell settings-shell">
    {header}
    {sidebar}
    <main className="home-panel settings-panel doan-scroll" aria-labelledby="settings-title">
      <div className="settings-page">
        <div className="settings-header"><div className="settings-header-copy">
          <h1 className="settings-title" id="settings-title" tabIndex={-1} ref={node => { heading.current = node; }}>{title}</h1>
          <p className="settings-lead">{LEADS[section]}</p>
        </div><div className="settings-header-actions" ref={setActions} /></div>
        <div className="settings-sections">
          {section === "agents" && <SettingsAgents key="agents" {...agents} arrival={provider} onLock={onLock} />}
          {section === "notifications" && <SettingsNotifications key="notifications" preferences={agents.preferences} save={agents.save} />}
          {section === "connections" && <SettingsConnections key="connections" onLock={onLock} actions={actions} />}
          {section === "about" && <SettingsAbout key="about" actions={actions} />}
        </div>
      </div>
    </main>
  </div>;
}
