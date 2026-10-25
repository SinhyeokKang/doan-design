// Drives the real useFirstPromptWait with a minimal hook scheduler (no DOM): the
// held hidden-window arrival is a ref, so only a hook run can observe it.
import { test, expect, vi } from 'vitest';
const harness = vi.hoisted(() => {
  let slots: any[] = [], cursor = 0, effects: (() => void)[] = [], dirty = false;
  const same = (a: any[], b: any[]) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  return {
    reset() { slots = []; cursor = 0; effects = []; dirty = false; },
    render(fn: () => any) { let result: any; let guard = 0; do { dirty = false; cursor = 0; result = fn(); const pending = effects; effects = []; pending.forEach(f => f()); if (++guard > 20) throw Error('render loop'); } while (dirty); return result; },
    useState(initial: any) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], (v: any) => { const next = typeof v === 'function' ? v(slots[i]) : v; if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; } }]; },
    useRef(initial: any) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect(fn: () => void, deps: any[]) { const i = cursor++; if (!same(slots[i], deps)) { slots[i] = deps; effects.push(fn); } },
    useMemo(fn: () => any, deps: any[]) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
  };
});
vi.mock('react', () => ({ ...harness, createContext: (value: any) => ({ value }), useContext: () => {}, useId: () => 'id' }));
import { useFirstPromptWait } from './FirstPrompt';
function setup() {
  harness.reset();
  let visibility: (visible: boolean) => void = () => {};
  vi.stubGlobal('window', { doan: { onWindowVisible: (fn: typeof visibility) => { visibility = fn; return () => {}; } } });
  const toast = vi.fn(), openCanvas = vi.fn();
  const deps: any = { entries: [{ path: '/project', kind: 'list', canvases: [] }], wizardOpen: false, workspaceRoot: '/project', toast, openCanvas, projectName: () => 'project' };
  const render = () => harness.render(() => useFirstPromptWait(deps));
  let wait = render(); wait.copied('/project'); render();
  return { deps, render, toast, openCanvas, visibility: (v: boolean) => visibility(v) };
}
test('control: hidden arrival emits toast on show, without opening', () => {
  const h = setup(); h.visibility(false);
  h.deps.entries = [{ path: '/project', kind: 'list', canvases: [{ path: 'new.html', mtimeMs: 2 }] }]; h.render();
  expect(h.toast).not.toHaveBeenCalled(); h.visibility(true);
  expect(h.toast).toHaveBeenCalledTimes(1); expect(h.openCanvas).not.toHaveBeenCalled();
});
test('removed project must cancel a held hidden arrival notification', () => {
  const h = setup(); h.visibility(false);
  h.deps.entries = [{ path: '/project', kind: 'list', canvases: [{ path: 'new.html', mtimeMs: 2 }] }]; h.render();
  h.deps.entries = []; h.render(); h.visibility(true);
  expect(h.toast).not.toHaveBeenCalled();
});

const withCanvas = [{ path: '/project', kind: 'list', canvases: [{ path: 'new.html', mtimeMs: 2 }] }];
test('a project removed and added back while hidden does not show the held toast', () => {
  const h = setup(); h.visibility(false);
  h.deps.entries = withCanvas; h.render();
  h.deps.entries = []; h.render();
  h.deps.entries = withCanvas; h.render(); h.visibility(true);
  expect(h.toast).not.toHaveBeenCalled();
});
test('a held toast is dropped when its canvas is gone on show, while the project stays', () => {
  const h = setup(); h.visibility(false);
  h.deps.entries = withCanvas; h.render();
  h.deps.entries = [{ path: '/project', kind: 'list', canvases: [] }]; h.render(); h.visibility(true);
  expect(h.toast).not.toHaveBeenCalled();
});
