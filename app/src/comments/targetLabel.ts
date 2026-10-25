import type { Target } from "../formats/types";

export interface TargetLabel { text: string; title: string; locatableHint: boolean }

// Code-point cuts keep surrogate pairs whole.
function cut(value: string, max: number): string {
  const points = Array.from(value);
  return points.length > max ? points.slice(0, max).join("") : value;
}

function excerpt(text: string | undefined): string | null {
  const folded = (text ?? "").replace(/\s+/g, " ").trim();
  if (!folded) return null;
  const short = cut(folded, 40);
  return short === folded ? folded : `${short}…`;
}

// Only an anchored match on the stored html: html is data and is never parsed as markup.
function tagOf(html: string): string | null {
  return /^<([A-Za-z][A-Za-z0-9-]{0,63})/.exec(html)?.[1] ?? null;
}

function frameName(id: string, frames: ReadonlyArray<{ id: string; title?: string }>): string {
  const title = frames.find(frame => frame.id === id)?.title;
  return cut(title?.trim() ? title : id, 80);
}

// Frame names come from the caller's frame list (the canvas's ls row), so an unopened canvas reads the same.
export function targetLabel(target: Target, frames: ReadonlyArray<{ id: string; title?: string }>): TargetLabel {
  const { element, frame } = target;
  if (element) {
    const id = element.doanId ? cut(element.doanId, 80) : null;
    const text = id === null ? excerpt(element.text) : null;
    const parts = [tagOf(element.html), id ?? (text === null ? null : `“${text}”`)].filter(part => part !== null);
    const name = parts.length ? `Element · ${parts.join(" ")}` : "Element";
    return { text: frame ? `${name} · in ${frameName(frame, frames)}` : name, title: cut(element.selector, 1000), locatableHint: true };
  }
  if (frame) return { text: `Frame · ${frameName(frame, frames)}`, title: cut(`[data-doan-frame="${frame}"]`, 1000), locatableHint: true };
  return { text: "Canvas", title: "Canvas", locatableHint: false };
}
