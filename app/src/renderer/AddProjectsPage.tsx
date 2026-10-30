import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { leaveLocked } from "./addProjectsNav";
import { ProjectScreen, useProjectFocus } from "./Onboarding";
import { addPageApi, ProjectStepSession } from "./projectStep";

// What App needs from the page: whether leaving is locked (design '잠금') and whether File > Add Project… may run
// Choose folder (design '메뉴').
export interface AddPageReport { locked: boolean; choose: boolean }

// The Add Projects page (buzz-add-projects): the shell's header and sidebar around first run's Project screen, over the
// page's own main instance. Each opening starts at choose; leaving drops an inspection in flight with the session.
export function AddProjectsPage({ header, sidebar, projects, homeDirectory, mainCheckout, choose, onState, onCancel, onAdded }: {
  header: ReactNode; sidebar: ReactNode; projects: readonly string[]; homeDirectory: string | null; mainCheckout: (path: string) => boolean;
  // Raised by File > Add Project… while the page shows; it runs Choose folder.
  choose: number;
  onState(report: AddPageReport): void; onCancel(): void; onAdded(root: string): void;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    window.doan.readAddPage().then(reply => { if (current && reply.ok && reply.op === "status") setSessionId(reply.result.sessionId); }).catch(console.error);
    return () => { current = false; };
  }, []);
  return <div className="app-shell home-shell add-shell">
    {header}
    {sidebar}
    <main className="home-panel add-panel doan-scroll" aria-labelledby="add-page-title">
      {sessionId !== null && <PageBody sessionId={sessionId} projects={projects} homeDirectory={homeDirectory} mainCheckout={mainCheckout} choose={choose} onState={onState} onCancel={onCancel} onAdded={onAdded} />}
    </main>
  </div>;
}

function PageBody({ sessionId, projects, homeDirectory, mainCheckout, choose, onState, onCancel, onAdded }: {
  sessionId: string; projects: readonly string[]; homeDirectory: string | null; mainCheckout: (path: string) => boolean; choose: number;
  onState(report: AddPageReport): void; onCancel(): void; onAdded(root: string): void;
}) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const live = useRef({ projects, homeDirectory, mainCheckout, onState, onAdded });
  live.current = { projects, homeDirectory, mainCheckout, onState, onAdded };
  const reported = useRef<AddPageReport | null>(null);
  const [session] = useState(() => {
    const created: ProjectStepSession = new ProjectStepSession({
      api: addPageApi(window.doan), use: "addPage", sessionId, projects: () => live.current.projects, homeDirectory: () => live.current.homeDirectory,
      mainCheckout: path => live.current.mainCheckout(path), requestId: () => crypto.randomUUID(), completed: root => live.current.onAdded(root),
      // Reported as the session changes, not after a render: a click between the two must already see the lock.
      changed: () => {
        redraw();
        const report = { locked: leaveLocked(created.state.phase), choose: created.state.phase.kind === "choose" && !created.busy() };
        if (reported.current?.locked !== report.locked || reported.current.choose !== report.choose) { reported.current = report; live.current.onState(report); }
      },
    });
    return created;
  });
  const scene = useRef<HTMLDivElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const { toUrl, openPicker } = useProjectFocus(session, scene, heading, () => true, true);
  useEffect(() => {
    session.start();
    // The page opens on its heading, which names the panel (design '포커스').
    requestAnimationFrame(() => heading.current?.focus());
    return () => session.dispose();
  }, []);
  const opened = useRef(choose);
  useEffect(() => {
    if (choose === opened.current) return;
    opened.current = choose;
    if (session.state.phase.kind === "choose") openPicker(() => void session.chooseFolder());
  }, [choose]);
  const p = session;
  return <div className="ob-scene add-scene" ref={scene}>
    <ProjectScreen use="addPage" headingId="add-page-title" state={p.state} busy={p.busy()} agentReady projects={projects} home={homeDirectory} urlValid={p.urlValid()}
      heading={node => { heading.current = node; }}
      drop={{ notice: p.dropNotice, allowed: () => p.canDrop(), started: () => p.dragStarted(), dropped: items => void p.drop(items) }}
      on={{
        back: onCancel, backToAgents: () => {},
        chooseFolder: () => openPicker(() => void p.chooseFolder()), chooseExisting: () => openPicker(() => void p.chooseExisting()), setUrl: url => p.setUrl(url), find: () => void p.findRepository(), cancelInspect: () => p.cancelInspect(), edit: toUrl,
        pickListed: () => {}, useListed: () => {}, pickCandidate: path => p.pickCandidate(path), select: () => void p.select(), setUp: inspectionId => void p.setUp(inspectionId),
        changeDestination: () => openPicker(() => void p.changeDestination()), useExisting: () => void p.useExisting(), clone: () => void p.clone(), cancelClone: () => void p.cancelClone(),
        complete: () => {}, retry: () => void p.retry(),
      }} />
  </div>;
}
