import type { ComponentProps } from "react";

// The person's colour rule for every progress ring: neutral below 70%, danger from 70%; there is no warning step.
export const DANGER = 70;
// Compared on the unrounded ratio, so a text that floors to "69%" is never drawn in danger and "70%" always is.
export function ringDanger(percent: number): boolean {
  return percent >= DANGER;
}

// The track and value circles in a 24 viewBox, shared by the header's usage rings and the composer's context ring.
// Each ring's own class sets its box and inks; r and stroke are its geometry in viewBox units (the usage ring's 11/2,
// the context ring's 10.5/3 that keeps a 2px stroke at 16px). Other props reach the span, so a tooltip trigger's ref
// and handlers land on it (React 19 passes ref as a prop).
export type ProgressRingProps = ComponentProps<"span"> & { className: string; value: number | null; danger: boolean; r: number; stroke: number; "data-provider"?: string };
export function ProgressRing({ value, danger, r, stroke, children, ...rest }: ProgressRingProps) {
  return <span {...rest} data-band={danger ? "full" : undefined}>
    {/* The arc starts at 12 o'clock and runs clockwise; pathLength 100 lets the dash be the percentage. */}
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={stroke} aria-hidden="true"><circle className="track" cx="12" cy="12" r={r} />
      {value !== null && <circle className="value" cx="12" cy="12" r={r} pathLength="100" strokeDasharray={`${value} 100`} />}</svg>
    {children}
  </span>;
}
