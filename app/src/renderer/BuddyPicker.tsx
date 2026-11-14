import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { AlertIcon } from "./AlertIcon";
import { BUDDY_IDS, FIRST_RUN_ORDER, buddy, knownBuddyId, type BuddyId } from "./buddies";
import { buddyFailureText } from "./buddyChoice";
import type { BuddyFailure } from "./buddySelection";
import { cardLayout, cardOffset, followPosition, keyTarget, scrollPosition, SNAP_MS, snapPosition, snapTarget, WHEEL_QUIET } from "./coverFlow";

// The buddy picker (.doan/canvases/buddy-choice.html): first run's Cover Flow row and Settings > General's rows. Both
// are a radio group named by the visible heading, each radio named by the buddy's name and described by its line.
// `name` is the radio group's name and the prefix of the label ids.
export interface BuddyPickerProps { name: string; labelledBy: string; selected: BuddyId; disabled: boolean; select(id: BuddyId): void }

// First run's row, in its own order with Doany in the middle. A card click and an arrow land on one buddy through
// `select`; the row stops at its ends, so arrows override the native radio wrap. A horizontal scroll moves the row
// continuously (the cards' transforms are written directly, a frame at a time) and, once the wheel events stop, snaps
// to the nearest card and selects only that one, so the cards passed over are never saved.
interface Scroll { target: number; shown: number; frame: number | null; time: number; quiet: ReturnType<typeof setTimeout> | null; snap: { from: number; to: number; start: number } | null; landed: boolean }
export function BuddyFlow({ name, labelledBy, selected, disabled, select }: BuddyPickerProps) {
  const group = useRef<HTMLDivElement | null>(null);
  const live = useRef({ selected, disabled, select });
  live.current = { selected, disabled, select };
  const scroll = useRef<Scroll | null>(null);
  // Hands the row back to the [data-o] rules, which by then draw the same layout the scroll last wrote.
  const release = () => {
    const state = scroll.current, node = group.current;
    if (!state) return;
    if (state.frame !== null) cancelAnimationFrame(state.frame);
    if (state.quiet !== null) clearTimeout(state.quiet);
    scroll.current = null;
    if (!node) return;
    delete node.dataset.scrolling;
    for (const card of node.querySelectorAll<HTMLElement>(".buddy-card")) { card.style.transform = ""; card.style.zIndex = ""; }
  };
  // The snapped card is drawn by the scroll until React draws it as the selected one.
  useLayoutEffect(() => { if (scroll.current?.landed) release(); }, [selected]);
  useEffect(() => {
    const node = group.current;
    if (!node) return;
    const draw = (position: number) => {
      const width = node.clientWidth;
      node.querySelectorAll<HTMLElement>(".buddy-card").forEach((card, i) => {
        const { x, rotate, scale, z } = cardLayout(i - position, width);
        card.style.transform = `translateX(${x}px) rotateY(${rotate}deg) scale(${scale})`;
        card.style.zIndex = String(z);
      });
    };
    const land = (state: Scroll, to: number) => {
      state.shown = to; state.landed = true; state.frame = null;
      draw(to);
      const id = FIRST_RUN_ORDER[to]!;
      if (id === live.current.selected) release(); else live.current.select(id);
    };
    const frame = (now: number) => {
      const state = scroll.current;
      if (!state) return;
      const elapsed = now - state.time;
      state.time = now;
      if (state.snap) {
        const t = now - state.snap.start;
        if (t >= SNAP_MS) { land(state, state.snap.to); return; }
        state.shown = snapPosition(state.snap.from, state.snap.to, t);
      } else state.shown = followPosition(state.shown, state.target, elapsed);
      draw(state.shown);
      state.frame = requestAnimationFrame(frame);
    };
    const snap = () => {
      const state = scroll.current;
      if (!state) return;
      state.quiet = null;
      const to = FIRST_RUN_ORDER.indexOf(snapTarget(FIRST_RUN_ORDER, state.target));
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) { if (state.frame !== null) cancelAnimationFrame(state.frame); land(state, to); return; }
      state.snap = { from: state.shown, to, start: performance.now() };
      if (state.frame === null) { state.time = performance.now(); state.frame = requestAnimationFrame(frame); }
    };
    // React's wheel listener is passive, and a handled scroll must not also scroll the step.
    const wheel = (event: WheelEvent) => {
      const { selected, disabled } = live.current;
      const from = scroll.current && !scroll.current.landed ? scroll.current.target : FIRST_RUN_ORDER.indexOf(selected);
      const result = scrollPosition(from, { deltaX: event.deltaX, deltaY: event.deltaY, shiftKey: event.shiftKey }, FIRST_RUN_ORDER.length);
      if (!result.handled) return;
      event.preventDefault();
      if (disabled) return;
      let state = scroll.current;
      if (!state || state.landed) {
        if (state) release();
        state = scroll.current = { target: from, shown: from, frame: null, time: performance.now(), quiet: null, snap: null, landed: false };
        node.dataset.scrolling = "";
      }
      state.target = result.position;
      state.snap = null;
      if (state.quiet !== null) clearTimeout(state.quiet);
      state.quiet = setTimeout(snap, WHEEL_QUIET);
      if (state.frame === null) { state.time = performance.now(); state.frame = requestAnimationFrame(frame); }
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => { node.removeEventListener("wheel", wheel); release(); };
  }, []);
  const pick = (id: BuddyId) => { release(); select(id); };
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const target = keyTarget(FIRST_RUN_ORDER, selected, event.key);
    if (target === null) return;
    event.preventDefault();
    if (target !== selected) pick(target);
    group.current?.querySelector<HTMLInputElement>(`input[value="${target}"]`)?.focus();
  };
  return <div role="radiogroup" aria-labelledby={labelledBy} aria-disabled={disabled || undefined} className="buddy-flow" ref={group} onKeyDown={keys}>
    {FIRST_RUN_ORDER.map(id => {
      const { name: title, line, assets } = buddy(id);
      return <label key={id} className="doan-panel buddy-card" data-o={cardOffset(FIRST_RUN_ORDER, id, selected)}>
        <input type="radio" name={name} value={id} checked={id === selected} disabled={disabled} aria-labelledby={`${name}-${id}-name`} aria-describedby={`${name}-${id}-line`} onChange={() => pick(id)} />
        <img src={assets.card} alt="" />
        <strong id={`${name}-${id}-name`}>{title}</strong>
        <span id={`${name}-${id}-line`}>{line}</span>
      </label>;
    })}
  </div>;
}

// Settings > General's rows: up/left and down/right go round them; other keys are not the rows'.
export function rowFocusTarget(ids: readonly BuddyId[], current: BuddyId, key: string): BuddyId | null {
  const step = key === "ArrowDown" || key === "ArrowRight" ? 1 : key === "ArrowUp" || key === "ArrowLeft" ? -1 : 0;
  if (step === 0) return null;
  const at = ids.indexOf(current);
  return ids[(at + step + ids.length) % ids.length] ?? null;
}

// Settings > General: one preference row per buddy in the default order. The whole row is the label, so the picture
// or the name picks too. A switch is confirmed first (PRODUCT §5 item 0 'General'), so a radio never turns checked on
// its own: a click (Space reaches the radio as one) or Return asks for the buddy through `request`, and the arrows only
// move focus, still going round as native radios do. Nothing moves and there is no accent ring. `inert`: under the
// lock overlay.
export interface BuddyRowsProps { name: string; labelledBy: string; selected: BuddyId; disabled: boolean; inert?: boolean; request(id: BuddyId): void }
export function BuddyRows({ name, labelledBy, selected, disabled, inert, request }: BuddyRowsProps) {
  const group = useRef<HTMLDivElement | null>(null);
  const ask = (id: BuddyId) => { if (!disabled && id !== selected) request(id); };
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const from = "value" in event.target ? event.target.value : null;
    const target = knownBuddyId(from) ? rowFocusTarget(BUDDY_IDS, from, event.key) : null;
    if (target === null) return;
    event.preventDefault();
    group.current?.querySelector<HTMLInputElement>(`input[value="${target}"]`)?.focus();
  };
  return <div role="radiogroup" aria-labelledby={labelledBy} className="buddy-rows" inert={inert} ref={group} onKeyDown={keys}>
    {BUDDY_IDS.map(id => {
      const { name: title, line, assets } = buddy(id);
      return <label key={id} className="doan-preference-row buddy-row" data-disabled={disabled ? "" : undefined}>
        <input type="radio" name={name} value={id} checked={id === selected} readOnly disabled={disabled} aria-labelledby={`${name}-${id}-name`} aria-describedby={`${name}-${id}-line`}
          onClick={(event: MouseEvent<HTMLInputElement>) => { event.preventDefault(); ask(id); }}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => { if (event.key !== "Enter") return; event.preventDefault(); ask(id); }} />
        <img src={assets.card} alt="" />
        <span className="doan-preference-row-content"><span className="doan-preference-row-label" id={`${name}-${id}-name`}>{title}</span><span className="doan-preference-row-description" id={`${name}-${id}-line`}>{line}</span></span>
        <span className="doan-preference-row-trailing"><span className="ob-radio" aria-hidden="true" /></span>
      </label>;
    })}
  </div>;
}

// A failed save: the picked buddy, the one that stays, and Retry, named by its visible word and described by the
// sentence. No live role: the screen's own live region reads the failure once. `className` places it (first run's
// panel notice under the row, or Settings' notice above the group).
export function BuddyFailureNotice({ failure, id, className, retry }: { failure: BuddyFailure; id: string; className: string; retry(): void }): ReactNode {
  return <div className={`doan-notice error ${className}`}>
    <AlertIcon /><span className="selectable" id={id}>{buddyFailureText(failure)}</span>
    <button type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" aria-describedby={id} onClick={retry}>Retry</button>
  </div>;
}

// After a Retry that saved, the notice is gone; focus goes to the checked radio rather than falling to <body>.
export function focusChecked(root: ParentNode | null): void {
  root?.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.focus();
}
