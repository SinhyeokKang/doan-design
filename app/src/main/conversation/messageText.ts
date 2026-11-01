import type { Anchor } from "./types";

// Shared by main and the renderer: this module must import nothing but types, because a renderer value import that
// reaches prompt.ts pulls in ajv and leaves the built window blank (POSTMORTEM 2026-10-30).

// UTF-16 code units, matching renderer string lengths; these are input bounds, not model budgets.
export const LIMITS = { text: 32_768, anchors: 32, selector: 2_048, excerpt: 2_048, label: 512, path: 4_096, attachments: 10 };

// An element chip quotes at most this much of its doan-id or text; the chip's title carries the whole of it.
export const CHIP_TEXT_MAX = 40;

// A message split at its {{n}} markers. Only a marker that names one of `count` anchors is a chip; anything else,
// {{0}} or {{n}} past the anchors included, stays text.
export type MessagePart = { text: string } | { n: number };
export function splitMarkers(text: string, count: number): MessagePart[] {
  const parts: MessagePart[] = [];
  let rest = "";
  let last = 0;
  for (const match of text.matchAll(/\{\{([1-9][0-9]*)\}\}/g)) {
    const n = Number(match[1]);
    if (n > count) continue;
    rest += text.slice(last, match.index);
    if (rest) parts.push({ text: rest });
    rest = "";
    parts.push({ n });
    last = match.index + match[0].length;
  }
  rest += text.slice(last);
  if (rest) parts.push({ text: rest });
  return parts;
}

export interface FrameName { id: string; title?: string }
export interface ChipLabel { kind: "frame" | "element" | "point"; label: string; title: string }

// People read roles, not tags; a class-derived name is never used (design §2 'Chip field').
const ELEMENT_NAMES: Record<string, string> = {
  h1: "heading", h2: "heading", h3: "heading", h4: "heading", h5: "heading", h6: "heading",
  a: "link", img: "image", input: "field", textarea: "field", select: "field", button: "button",
};
const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();
const cut = (value: string) => (value.length > CHIP_TEXT_MAX ? `${value.slice(0, CHIP_TEXT_MAX - 1)}…` : value);

// The open canvas's frame list names a frame when it has one; otherwise the title the anchor carried, then its id.
function frameName(id: string, carried: string | undefined, frames: readonly FrameName[]): string {
  return oneLine(frames.find(frame => frame.id === id)?.title || carried || "") || id;
}

export function chipLabel(anchor: Anchor, frames: readonly FrameName[] = []): ChipLabel {
  const frameId = anchor.frame?.id ?? anchor.point?.frameId;
  const inFrame = frameId === undefined ? "" : ` · in ${frameId}`;
  if (anchor.element) {
    const tag = anchor.element.tag?.toLowerCase();
    const name = tag ? ELEMENT_NAMES[tag] ?? tag : "element";
    const raw = tag ?? name;
    const doanId = anchor.element.doanId, text = anchor.element.text === undefined ? "" : oneLine(anchor.element.text);
    if (doanId) return { kind: "element", label: `${name} ${cut(doanId)}`, title: `Element · ${raw} ${doanId}${inFrame}` };
    if (text) return { kind: "element", label: `${name} “${cut(text)}”`, title: `Element · ${raw} “${text}”${inFrame}` };
    return { kind: "element", label: name, title: `Element · ${raw}${inFrame}` };
  }
  if (anchor.point) {
    const { dx, dy } = anchor.point;
    if (frameId === undefined) return { kind: "point", label: "Point", title: `Point (${dx}, ${dy})` };
    return { kind: "point", label: `Point in ${frameName(frameId, anchor.frame?.title, frames)}`, title: `Point · ${frameId} (${dx}, ${dy})` };
  }
  const id = anchor.frame?.id ?? "";
  return { kind: "frame", label: frameName(id, anchor.frame?.title, frames), title: `Frame · ${id}` };
}

// The one-line form of a message for titles, previews, the queue and notifications: each chip marker reads as its
// chip's name, and line breaks and runs of spaces, in the text or in a frame's name, read as one space. A marker
// without an anchor stays as typed.
export function messageLine(text: string, anchors: readonly Anchor[], frames: readonly FrameName[] = []): string {
  const line = splitMarkers(text, anchors.length).map(part => ("n" in part ? chipLabel(anchors[part.n - 1]!, frames).label : part.text)).join("");
  return oneLine(line).slice(0, LIMITS.label);
}
