import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { REPOSITORY_URL } from "../main/repository";
import type { StarMoment } from "../main/starPrompt";
import { AlertIcon } from "./AlertIcon";
import { STAR_IDLE_MS, STAR_OVERLAY_QUERY, starPromptMoment } from "./starPromptMoment";
import { FLOATING_EXIT_MS } from "./toastState";

export const STAR_TEXT = "Find Doan useful? It’s open source on GitHub.";
const FAILED_LEAD = "Couldn’t open GitHub in your browser. Try again, or find Doan at ";
// Ends on the address with no period, so selecting it copies only the address.
export const starOpenFailedLine = `${FAILED_LEAD}${REPOSITORY_URL}`;
// The live region is added empty and filled this much later: a region added with its words already in it is not read.
const SAY_DELAY_MS = 100;
const INPUT_EVENTS = ["keydown", "pointerdown", "pointermove", "wheel"] as const;

export interface StarCard {
  second: boolean;
  // Main could not open the browser; the button is the retry.
  failed: boolean;
  // The live region holds the words.
  said: boolean;
  // Drawn for its exit motion, then removed.
  closing: boolean;
}

export interface StarPromptViewProps {
  card: StarCard | null;
  onOpen(): void;
  onDismiss(): void;
  onKeyDown(event: Pick<KeyboardEvent, "key" | "defaultPrevented" | "preventDefault" | "stopPropagation"> & { isComposing?: boolean }): void;
  onFocus(event: FocusEvent<HTMLDivElement>): void;
  buttonRef(node: HTMLButtonElement | null): (() => void) | undefined;
}

export interface StarPromptProps {
  onboarding: boolean;
  pickOrCapture: boolean;
  // Where focus goes when a focused button of the card goes; App's rule for toasts.
  restoreFocus?(previous: HTMLElement | null): void;
}

// The GitHub star card: main says a card is due, the card waits for 1.2 s with no key or pointer input and then shows
// unless something else has the person's attention, in which case main's next moment tries again. It never takes focus
// and is the app document's last Tab stop; outside presses and focus moves leave it alone (POSTMORTEM 2026-11-09, a
// quiet popover closed by focus moving elsewhere), so it is not a Radix popover.
export function StarPrompt(props: StarPromptProps) {
  const [card, setCard] = useState<StarCard | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const shown = useRef(card);
  shown.current = card;
  const nativeVisible = useRef(false);
  const waiting = useRef(false);
  const opening = useRef(false);
  const previousFocus = useRef<HTMLElement | null>(null);
  const buttonRef = useRef((node: HTMLButtonElement | null) => {
    if (!node) return;
    return () => {
      if (node !== document.activeElement) return;
      const previous = previousFocus.current;
      queueMicrotask(() => latest.current.restoreFocus?.(previous));
    };
  });
  useEffect(() => {
    let stopWait = () => {};
    const stopVisible = window.doan.onWindowVisible(visible => { nativeVisible.current = visible; });
    const stopMoment = window.doan.onStarMoment((moment: StarMoment) => {
      if (waiting.current || shown.current !== null) return;
      waiting.current = true;
      let last = Date.now();
      let timer: ReturnType<typeof setTimeout>;
      const input = () => { last = Date.now(); clearTimeout(timer); timer = setTimeout(decide, STAR_IDLE_MS); };
      const stop = () => { clearTimeout(timer); for (const type of INPUT_EVENTS) window.removeEventListener(type, input, true); };
      function decide() {
        void window.doan.starPromptBusy().catch(() => true).then(busy => {
          stop();
          waiting.current = false;
          const show = starPromptMoment({
            idleMs: Date.now() - last,
            windowActive: nativeVisible.current && !document.hidden && document.hasFocus(),
            onboarding: latest.current.onboarding,
            overlayOpen: document.querySelector(STAR_OVERLAY_QUERY) !== null,
            otherTurnBusy: busy,
            pickOrCapture: latest.current.pickOrCapture,
            cardVisible: shown.current !== null,
          });
          if (show) setCard({ second: moment.second, failed: false, said: false, closing: false });
        });
      }
      // Capture phase, so input a page handles and stops still counts.
      for (const type of INPUT_EVENTS) window.addEventListener(type, input, { capture: true, passive: true });
      timer = setTimeout(decide, STAR_IDLE_MS);
      stopWait = () => { stop(); waiting.current = false; };
    });
    return () => { stopVisible(); stopMoment(); stopWait(); };
  }, []);
  const appeared = card !== null && !card.closing;
  useEffect(() => {
    if (!appeared) return;
    const timer = setTimeout(() => setCard(current => current && { ...current, said: true }), SAY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [appeared]);
  const closing = card?.closing === true;
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => setCard(null), FLOATING_EXIT_MS);
    return () => clearTimeout(timer);
  }, [closing]);
  const close = () => setCard(current => current && { ...current, closing: true });
  const live = card !== null && !card.closing;
  const onOpen = () => {
    if (!live || opening.current) return;
    opening.current = true;
    void window.doan.openStarRepository().catch(() => false).then(opened => {
      opening.current = false;
      if (opened) close();
      else setCard(current => current && !current.closing ? { ...current, failed: true } : current);
    });
  };
  const onDismiss = () => {
    if (!live) return;
    void window.doan.dismissStarPrompt().catch(() => {});
    close();
  };
  return <StarPromptView card={card} onOpen={onOpen} onDismiss={onDismiss} buttonRef={buttonRef.current}
    onKeyDown={event => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
      // The card's own Esc: the page's Escape (leaving a page, cancelling a pick) does not also run.
      event.preventDefault(); event.stopPropagation();
      onDismiss();
    }}
    onFocus={event => { if (!event.currentTarget.contains(event.relatedTarget)) previousFocus.current = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null; }} />;
}

export function StarPromptView({ card, onOpen, onDismiss, onKeyDown, onFocus, buttonRef }: StarPromptViewProps) {
  if (card === null) return null;
  // Keyed apart while closing, so a focused button that goes hands focus back through `buttonRef`.
  const key = (name: string) => card.closing ? `${name}:closing` : name;
  return <div className="star-prompt doan-floating" role="region" aria-label="Doan on GitHub" {...(card.closing ? { "data-closing": "", inert: true } : {})}
    onKeyDown={event => onKeyDown({ key: event.key, defaultPrevented: event.defaultPrevented, isComposing: event.nativeEvent.isComposing, preventDefault: () => event.preventDefault(), stopPropagation: () => event.stopPropagation() })} onFocus={onFocus}>
    {/* The words are read through the live region below; this copy is for the eye. */}
    <p className="star-prompt-text" aria-hidden="true">{STAR_TEXT}</p>
    <p className="sr-only" role="status">{card.said ? card.failed ? starOpenFailedLine : STAR_TEXT : ""}</p>
    {card.failed && <p className="settings-msg error selectable star-prompt-failure"><AlertIcon /><span>{FAILED_LEAD}<span className="star-prompt-url">{REPOSITORY_URL}</span></span></p>}
    <div className="star-prompt-actions">
      <button key={key("open")} ref={buttonRef} type="button" className="doan-button" data-ui-variant="prominent" data-ui-size="sm" onClick={onOpen}>Star on GitHub ↗</button>
      <button key={key("dismiss")} ref={buttonRef} type="button" className="doan-button" data-ui-variant="subtle" data-ui-size="sm" onClick={onDismiss}>{card.second ? "Don’t ask again" : "Not now"}</button>
    </div>
  </div>;
}
