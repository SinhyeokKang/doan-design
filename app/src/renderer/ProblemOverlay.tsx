import type { ReactNode, Ref } from "react";
import { ROW_ACTION_LABELS, type RowAction } from "./homeCards";
import type { ProblemOverlayView } from "./problemView";

// The config file a Config error's line starts with, drawn as a code chip like Missing's path.
const CONFIG_FILE = ".doan/config.json";
// The window draws one workspace, so one overlay at most.
export const PROBLEM_HEADING_ID = "problem-overlay-heading";
const LINE_ID = "problem-overlay-line";

// PRODUCT §5 item 3 'Problem states'; ARCHITECTURE §7 'Problem overlay'. It draws `problemView`'s result only; App owns the
// Details state per root, the busy action, focus and the live region's text.
export function ProblemOverlay({ view, details, detail, pressed, announcement, onAction, headingRef }: {
  view: Extract<ProblemOverlayView, { kind: "reading" }> | Omit<Extract<ProblemOverlayView, { kind: "problem" }>, "entryKind">;
  headingRef?: Ref<HTMLHeadingElement>;
  // Details is open, with the message to show (the last one seen while the entry is being read again).
  details: boolean; detail?: string | undefined;
  // The action whose press made the scene busy; it shows the spinner.
  pressed: RowAction | null;
  // What the polite live region reads when focus was left where it was.
  announcement: string;
  onAction(name: RowAction): void;
}) {
  if (view.kind === "reading") return <div className="problem-overlay reading doan-scroll"><p className="problem-reading" role="status"><span className="doan-spinner" aria-hidden="true" />{view.label}</p></div>;
  const Icon = view.icon;
  const { path, text } = view.line;
  const line: ReactNode = path !== undefined ? <><code>{path}</code> {text}</>
    : text.startsWith(CONFIG_FILE) ? <><code>{CONFIG_FILE}</code>{text.slice(CONFIG_FILE.length)}</> : text;
  return <div className="problem-overlay doan-scroll">
    <div className="problem-scene" role="group" aria-labelledby={PROBLEM_HEADING_ID}>
      <Icon className="problem-icon" aria-hidden="true" />
      <div className="ob-heading problem-heading">
        <h2 ref={headingRef} id={PROBLEM_HEADING_ID} tabIndex={-1} aria-describedby={LINE_ID}>{view.heading}</h2>
        <p id={LINE_ID} className="selectable">{line}</p>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      <div className="problem-actions">{view.actions.map(({ name, variant }) => {
        const spinning = view.busy && pressed === name;
        // Busy actions stay focusable (aria-disabled, not disabled) so focus stays on the pressed one; the others take
        // the disabled look, which the shared hover and pressed fills skip.
        return <button key={name} type="button" className={`doan-button${variant === "ghost" ? " ghost" : ""}`}
          data-ui-variant={variant === "ghost" ? undefined : variant} data-ui-size="sm" aria-disabled={view.busy || undefined} data-disabled={view.busy && !spinning ? "" : undefined} aria-busy={spinning || undefined}
          aria-expanded={name === "details" ? details : undefined} onClick={() => { if (!view.busy) onAction(name); }}>
          {spinning && <span className="doan-spinner" aria-hidden="true" />}{ROW_ACTION_LABELS[name]}{name === "details" && (details ? " ▾" : " ▸")}
        </button>;
      })}</div>
      {details && detail !== undefined && <pre className="problem-detail selectable">{detail}</pre>}
    </div>
  </div>;
}
