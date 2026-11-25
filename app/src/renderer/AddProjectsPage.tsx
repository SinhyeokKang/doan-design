import { useEffect, useReducer, useRef, useState, type ReactNode, type RefObject } from "react";
import { CircleAlert } from "lucide-react";
import { ProblemOverlay, PROBLEM_HEADING_ID } from "./ProblemOverlay";
import { leaveLocked } from "./addProjectsNav";
import { ProjectScreen, useProjectFocus, type ProjectScreenProps } from "./Onboarding";
import { addPageApi, ProjectStepSession } from "./projectStep";

// What App needs from the page: whether leaving is locked and whether File > Add Projects… may run
// Choose folder.
export interface AddPageReport { locked: boolean; choose: boolean }

// The backdrop draws the same empty form before a session exists. It has no session actions.
const noop = () => {};
const READ_ERROR = "Couldn’t open Add Projects";
const backdropActions: ProjectScreenProps["on"] = {
  back: noop, backToAgents: noop, chooseFolder: noop, chooseExisting: noop, setUrl: noop, find: noop, cancelInspect: noop,
  edit: noop, pickListed: noop, useListed: noop, pickCandidate: noop, select: noop, setUp: noop, changeDestination: noop,
  useExisting: noop, clone: noop, cancelClone: noop, complete: noop, retry: noop, setStorage: noop, newFolder: noop,
  chooseAnotherName: noop, useExistingFolder: noop, newFolderElsewhere: noop,
};

function shouldFocusHeading(origin: Element | null) {
  const active = document.activeElement;
  return !active || active === document.body || active === origin || active.closest(".add-panel") !== null;
}

export function AddProjectsPage({ header, sidebar, projects, homeDirectory, mainCheckout, choose, onState, onCancel, onAdded }: {
  header: ReactNode; sidebar: ReactNode; projects: readonly string[]; homeDirectory: string | null; mainCheckout: (path: string) => boolean;
  // Raised by File > Add Projects… while the page shows; it runs Choose folder.
  choose: number;
  onState(report: AddPageReport): void; onCancel(): void; onAdded(root: string): void;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  // The `choose` already answered. Kept here, not in the body, so a ⌘O pressed before the session was read still
  // runs Choose folder once the body mounts.
  const chosen = useRef(choose);
  const [readState, setReadState] = useState<"opening" | "failed" | "retrying">("opening");
  const failed = sessionId === null && readState !== "opening";
  const [failures, setFailures] = useState(0);
  const readOrigin = useRef<Element | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const pending = useRef<ReturnType<typeof window.doan.readAddPage> | null>(null);
  const problemHeading = useRef<HTMLHeadingElement>(null);
  const latest = useRef({ onState, choose });
  latest.current = { onState, choose };
  function read(retry: boolean) {
    if (pending.current) return;
    if (retry) setReadState("retrying");
    readOrigin.current = document.activeElement;
    const request = window.doan.readAddPage();
    pending.current = request;
    void request.catch(() => null).then(reply => {
      if (pending.current !== request) return;
      pending.current = null;
      if (reply?.ok && reply.op === "status") {
        if (retry) {
          chosen.current = latest.current.choose;
          latest.current.onState({ locked: false, choose: true });
        }
        setSessionId(reply.result.sessionId);
      } else {
        setFailures(count => count + 1);
        setReadState("failed");
        latest.current.onState({ locked: false, choose: false });
      }
    });
  }
  useEffect(() => {
    read(false);
    return () => { pending.current = null; };
  }, []);
  useEffect(() => {
    if (!failures) return;
    if (failures === 1 && shouldFocusHeading(readOrigin.current)) problemHeading.current?.focus();
    else setAnnouncement(previous => previous === READ_ERROR ? READ_ERROR + "\u00a0" : READ_ERROR);
  }, [failures]);
  return <div className="app-shell home-shell add-shell">
    {header}
    {sidebar}
    <main className="home-panel add-panel doan-scroll" aria-labelledby={failed ? PROBLEM_HEADING_ID : "add-page-title"}>
      {failed && <>
        <div className="ob-scene add-scene" inert aria-hidden="true">
          <ProjectScreen use="addPage" state={{ phase: { kind: "choose" }, url: "", inspectedUrl: null, error: null, listChoice: null }}
            busy={false} agentReady projects={projects} home={homeDirectory} urlValid={false} heading={noop} on={backdropActions} />
        </div>
        <ProblemOverlay view={{ kind: "problem", icon: CircleAlert, heading: READ_ERROR,
          line: { text: "Try again to choose a local folder or enter a GitHub repository URL." },
          actions: [{ name: "retry", variant: "prominent" }], busy: readState === "retrying" }}
          headingRef={problemHeading} details={false} pressed="retry" announcement={announcement} onAction={() => read(true)} />
      </>}
      {sessionId !== null && <PageBody readOrigin={readOrigin} sessionId={sessionId} projects={projects} homeDirectory={homeDirectory} mainCheckout={mainCheckout} choose={choose} chosen={chosen} onState={onState} onCancel={onCancel} onAdded={onAdded} />}
    </main>
  </div>;
}

function PageBody({ readOrigin, sessionId, projects, homeDirectory, mainCheckout, choose, chosen, onState, onCancel, onAdded }: {
  readOrigin: RefObject<Element | null>; sessionId: string; projects: readonly string[]; homeDirectory: string | null; mainCheckout: (path: string) => boolean; choose: number; chosen: RefObject<number>;
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
  const { toUrl, openPicker, keepFocus } = useProjectFocus(session, scene, heading, () => true, true);
  useEffect(() => {
    session.start();
    // The page opens on its heading, which names the panel.
    requestAnimationFrame(() => { if (shouldFocusHeading(readOrigin.current)) heading.current?.focus(); });
    return () => session.dispose();
  }, [session, readOrigin]);
  useEffect(() => {
    if (choose === chosen.current) return;
    chosen.current = choose;
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
        pickListed: () => {}, useListed: () => {}, pickCandidate: path => p.pickCandidate(path), setStorage: storage => keepFocus(() => p.setStorage(storage)), select: () => void p.select(), setUp: inspectionId => void p.setUp(inspectionId),
        changeDestination: () => openPicker(() => void p.changeDestination()), useExisting: () => void p.useExisting(), clone: () => void p.clone(), cancelClone: () => void p.cancelClone(),
        complete: () => {}, retry: () => void p.retry(),
        newFolder: () => openPicker(() => void p.newFolder()), chooseAnotherName: () => openPicker(() => void p.chooseAnotherName()),
        useExistingFolder: () => void p.useExistingFolder(), newFolderElsewhere: () => openPicker(() => void p.newFolderElsewhere()),
      }} />
  </div>;
}
