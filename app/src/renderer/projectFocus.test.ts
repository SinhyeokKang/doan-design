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
