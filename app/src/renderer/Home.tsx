import { useState, type ReactNode } from "react";
import type { FolderEntry } from "../main/view";
import { displayPath } from "./projectDisplay";
import { cardRow, ROW_ACTION_LABELS as labels, type RowAction } from "./homeCards";
import { AlertIcon } from "./AlertIcon";
import { HeroComposer, type HeroComposerProps } from "./HomeComposerView";
import { groupProjects } from "./homeCards";
import { pickGreeting } from "./homeComposer";

interface HomeProps extends Omit<HeroComposerProps, "greeting"> {
  header: ReactNode;
  sidebar: ReactNode;
}
// Home is the workspace's shell with the composer as its body (buzz-home design §3): the project cards, the setup
// checklist and the connection banner are gone; projects live in the sidebar, connections in Settings.
export function Home({ header, sidebar, ...composer }: HomeProps) {
  // One greeting per visit, never the previous one; it does not animate (design §5).
  const [greeting] = useState(() => {
    const hasProject = groupProjects(composer.entries, new Map()).length > 0;
    const picked = pickGreeting(composer.memory.current.greeting, Math.random, hasProject);
    composer.memory.current = { ...composer.memory.current, greeting: picked };
    return picked;
  });
  return <main className="app-shell home-shell">
    {header}
    {sidebar}
    <section className="home-panel" aria-label="Home">
      <HeroComposer {...composer} greeting={greeting} />
    </section>
  </main>;
}

export function ProblemActions({ entry, action, workspace }: { entry: FolderEntry; action: (action: RowAction, root: string) => void; workspace: { name: string; homeDirectory: string | null; home: () => void } }) {
  const [details, setDetails] = useState(false);
  const row = cardRow(entry, null, null);
  const actions = <div className="wt-actions">{row.actions.map(name => <button className={`btn doan-button${name === "remove" || name === "details" ? " ghost" : ""}`} data-ui-variant={name === "remove" || name === "details" ? undefined : "subtle"} data-ui-size="sm" key={name} aria-label={labels[name]} aria-expanded={name === "details" ? details : undefined} onClick={() => name === "details" ? setDetails(!details) : action(name, entry.path)}>{labels[name]}{name === "details" && (details ? " ▾" : " ▸")}</button>)}</div>;
  const message = details && row.detail && <span className="ob-msg error"><AlertIcon /><span>{row.detail}</span></span>;
  return <div className="ws-recovery" role="region" aria-label="Project status"><div className="ws-status" role="status">
    <span className={`ob-chip${entry.kind === "error" ? " err" : entry.kind === "cliError" || entry.kind === "notFound" ? " warn" : ""}`}>{row.chip}</span>
    {entry.kind === "notFound" ? <span className="text" title={`${displayPath(entry.path, workspace.homeDirectory)} is gone or moved.`}><code>{displayPath(entry.path, workspace.homeDirectory)}</code> is gone or moved.</span> : entry.kind === "uninitialized" ? <span className="text" title={`${workspace.name} is not set up.`}>{workspace.name} is not set up.</span> : <span className="spacer" />}
    {actions}<button className="btn ghost doan-button" data-ui-size="sm" onClick={workspace.home}>Go Home</button>
  </div>{message && <div className="ws-detail">{message}</div>}</div>;
}
