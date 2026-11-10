import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { AlertIcon } from "./AlertIcon";
import { BUDDY_IDS, FIRST_RUN_ORDER, buddy, type BuddyId } from "./buddies";
import { buddyFailureText } from "./buddyChoice";
import type { BuddyFailure } from "./buddySelection";
import { cardOffset, keyTarget, stepTarget, WHEEL_IDLE, wheelInput } from "./coverFlow";

// The buddy picker (.doan/canvases/buddy-choice.html): first run's Cover Flow row and Settings > General's rows. Both
// are a radio group named by the visible heading, each radio named by the buddy's name and described by its line.
// `name` is the radio group's name and the prefix of the label ids.
export interface BuddyPickerProps { name: string; labelledBy: string; selected: BuddyId; disabled: boolean; select(id: BuddyId): void }

// First run's row, in its own order with Doany in the middle. Every input (a card click, an arrow, a horizontal scroll)
// lands on one buddy through `select`; the row stops at its ends, so arrows override the native radio wrap. A trackpad
// swipe moves one card per gesture.
export function BuddyFlow({ name, labelledBy, selected, disabled, select }: BuddyPickerProps) {
  const group = useRef<HTMLDivElement | null>(null);
  const live = useRef({ selected, disabled, select });
  live.current = { selected, disabled, select };
  // React's wheel listener is passive, and a handled swipe must not also scroll the step.
  useEffect(() => {
    const node = group.current;
    if (!node) return;
    let gesture = WHEEL_IDLE;
    const wheel = (event: WheelEvent) => {
      const result = wheelInput(gesture, { deltaX: event.deltaX, deltaY: event.deltaY, shiftKey: event.shiftKey, time: event.timeStamp });
      gesture = result.gesture;
      if (!result.handled) return;
      event.preventDefault();
      const { selected, disabled, select } = live.current;
      if (disabled || result.step === 0) return;
      const target = stepTarget(FIRST_RUN_ORDER, selected, result.step);
      if (target !== selected) select(target);
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, []);
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const target = keyTarget(FIRST_RUN_ORDER, selected, event.key);
    if (target === null) return;
    event.preventDefault();
    if (target !== selected) select(target);
    group.current?.querySelector<HTMLInputElement>(`input[value="${target}"]`)?.focus();
  };
  return <div role="radiogroup" aria-labelledby={labelledBy} aria-disabled={disabled || undefined} className="buddy-flow" ref={group} onKeyDown={keys}>
    {FIRST_RUN_ORDER.map(id => {
      const { name: title, line, assets } = buddy(id);
      return <label key={id} className="doan-panel buddy-card" data-o={cardOffset(FIRST_RUN_ORDER, id, selected)}>
        <input type="radio" name={name} value={id} checked={id === selected} disabled={disabled} aria-labelledby={`${name}-${id}-name`} aria-describedby={`${name}-${id}-line`} onChange={() => select(id)} />
        <img src={assets.card} alt="" />
        <strong id={`${name}-${id}-name`}>{title}</strong>
        <span id={`${name}-${id}-line`}>{line}</span>
      </label>;
    })}
  </div>;
}

// Settings > General: one preference row per buddy in the default order. The whole row is the label, so the picture
// or the name picks too; arrows keep the native radio wrap. Nothing moves and there is no accent ring.
export function BuddyRows({ name, labelledBy, selected, disabled, select }: BuddyPickerProps) {
  return <div role="radiogroup" aria-labelledby={labelledBy} className="buddy-rows">
    {BUDDY_IDS.map(id => {
      const { name: title, line, assets } = buddy(id);
      return <label key={id} className="doan-preference-row buddy-row" data-disabled={disabled ? "" : undefined}>
        <input type="radio" name={name} value={id} checked={id === selected} disabled={disabled} aria-labelledby={`${name}-${id}-name`} aria-describedby={`${name}-${id}-line`} onChange={() => select(id)} />
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
