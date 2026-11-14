import { afterEach, expect, test, vi } from "vitest";

// There is no DOM in these tests (no jsdom): useProjectFocus runs with its refs and effects kept by call order, as React
// keeps them, and the elements are stand-ins that record focus.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useRef: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
      return hooks.slots[index];
    },
    useEffect: (effect: () => void, deps: unknown[]) => {
      const index = hooks.cursor++;
      const seen = hooks.slots[index] as unknown[] | undefined;
      if (seen && seen.length === deps.length && seen.every((value, i) => Object.is(value, deps[i]))) return;
      hooks.slots[index] = deps;
      effect();
    },
  };
});
const { useProjectFocus } = await import("./Onboarding");

class Element { disabled = false; focused = 0; isConnected = true; matches(selector: string) { return selector === ":disabled" ? this.disabled : false; } focus() { this.focused++; doc.activeElement = this; } }
const doc: { activeElement: Element | null; body: Element } = { activeElement: null, body: new Element() };
vi.stubGlobal("HTMLElement", Element);
vi.stubGlobal("document", doc);
vi.stubGlobal("requestAnimationFrame", (run: () => void) => { run(); return 0; });
afterEach(() => { hooks.slots = []; });

// An arrow key on the setup panel's storage radios plans the folder again, and the plan disables the radios meanwhile,
// which drops focus: once the plan is made, focus is back on the radio the person chose, not on the heading.
test("a storage radio that plans the folder again gets focus back once the plan is made", () => {
  const radio = new Element(), heading = new Element();
  let busy = false;
  const session = { state: { phase: { kind: "setup" }, error: null }, busy: () => busy, picking: () => false };
  const scope = { current: { querySelector: () => null } };
  const render = () => { hooks.cursor = 0; return useProjectFocus(session as never, scope as never, { current: heading } as never, () => true, true); };
  doc.activeElement = radio;
  const { keepFocus } = render();
  keepFocus(() => true);
  // The plan runs: the radios are disabled and focus falls to the heading.
  busy = true; radio.disabled = true; doc.activeElement = doc.body;
  render();
  expect(heading.focused).toBe(1);
  busy = false; radio.disabled = false;
  render();
  expect(doc.activeElement).toBe(radio);
  // A radio that plans nothing leaves focus where it is on later changes.
  const other = new Element();
  doc.activeElement = other;
  render().keepFocus(() => false);
  busy = true; render(); busy = false; render();
  expect(doc.activeElement).toBe(other);
});

// A failed re-plan keeps the setup screen with its error; like any failure after the person's own action, focus goes to
// its notice rather than back to the radio.
test("a storage radio whose re-plan fails hands focus to the error, not back to the radio", () => {
  const radio = new Element(), heading = new Element(), alert = new Element();
  let busy = false;
  const session = { state: { phase: { kind: "setup" }, error: null as { code: string } | null }, busy: () => busy, picking: () => false };
  const scope = { current: { querySelector: (selector: string) => selector.includes('role="alert"') ? alert : null } };
  const render = () => { hooks.cursor = 0; return useProjectFocus(session as never, scope as never, { current: heading } as never, () => true, true); };
  doc.activeElement = radio;
  render().keepFocus(() => true);
  busy = true; radio.disabled = true; doc.activeElement = doc.body;
  render();
  busy = false; radio.disabled = false; session.state = { ...session.state, error: { code: "project_unavailable" } };
  render();
  expect(doc.activeElement).toBe(alert);
  expect(alert.focused).toBe(1);
});

// A radio changed with nothing focused leaves <body> active; the hook never hands focus back to <body>.
test("a re-plan started with nothing focused does not restore focus to <body>", () => {
  const heading = new Element();
  let busy = false;
  const session = { state: { phase: { kind: "setup" }, error: null }, busy: () => busy, picking: () => false };
  const scope = { current: { querySelector: () => null } };
  const render = () => { hooks.cursor = 0; return useProjectFocus(session as never, scope as never, { current: heading } as never, () => true, true); };
  const { keepFocus } = render();
  doc.activeElement = doc.body;
  keepFocus(() => true);
  busy = true; render(); busy = false; render();
  expect(doc.body.focused).toBe(0);
  expect(doc.activeElement).toBe(heading);
});

// New folder's save panel: a cancel returns focus to the button that opened it, New folder on the card or a notice's
// Choose another name / Change location while that notice stays; if the notice went, to New folder, not Choose folder.
test("a cancelled save panel hands focus back to New folder, or to the notice button that opened it", () => {
  const newFolder = new Element(), choose = new Element(), heading = new Element(), alert = new Element(), again = new Element();
  let busy = false, picking = false;
  const exists = { code: "folder_exists", path: "/Users/ada/a", directory: true, source: "folder" };
  const session = { state: { phase: { kind: "choose" }, error: null as typeof exists | null }, busy: () => busy, picking: () => picking };
  const scope = { current: { querySelector: (selector: string) => selector.includes("data-new-folder") ? newFolder : selector.includes(".ob-local-option") ? choose : selector.includes('role="alert"') ? alert : null } };
  const render = () => { hooks.cursor = 0; return useProjectFocus(session as never, scope as never, { current: heading } as never, () => true, true); };
  const open = (from: Element) => {
    doc.activeElement = from;
    render().openPicker(() => { picking = true; busy = true; });
    // The busy step disables the card's buttons while the panel is open, which drops focus.
    from.disabled = true; doc.activeElement = doc.body;
    render();
  };
  const cancel = (from: Element) => { picking = false; busy = false; from.disabled = false; render(); };
  render();
  open(newFolder); cancel(newFolder);
  expect(doc.activeElement).toBe(newFolder);
  // The panel answered with an existing folder: the new notice takes focus.
  open(newFolder); session.state = { ...session.state, error: exists }; cancel(newFolder);
  expect(doc.activeElement).toBe(alert);
  // Choose another name in that notice, cancelled: the notice is still there, so focus is back on its button.
  open(again); cancel(again);
  expect(doc.activeElement).toBe(again);
  // The notice and its button went meanwhile: New folder, since the notice was New folder's.
  open(again); again.isConnected = false; session.state = { ...session.state, error: null }; cancel(again);
  expect(doc.activeElement).toBe(newFolder);
  expect(choose.focused).toBe(0);
  // A Choose folder notice's button that went keeps the shipped place, the card's Choose folder.
  const gone = new Element();
  session.state = { ...session.state, error: { ...exists, code: "project_unavailable" } };
  render();
  const failure = session.state.error;
  open(gone); gone.isConnected = false; session.state = { ...session.state, error: null }; cancel(gone);
  expect(failure?.code).toBe("project_unavailable");
  expect(doc.activeElement).toBe(choose);
});
