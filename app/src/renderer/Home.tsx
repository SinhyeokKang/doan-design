import { useState, type ReactNode } from "react";
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
