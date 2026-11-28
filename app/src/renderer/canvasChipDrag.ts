import { useEffect, useRef, useState, type DragEvent, type RefObject } from "react";
import type { Anchor } from "../main/conversation/types";
import type { CanvasChipComposer } from "./canvasChip";
import { chipNode, type ChipInsert } from "./chipField";
import type { ComposerFieldHandle } from "./ComposerParts";

// A sidebar canvas row dragged toward a composer. The transfer carries only this marker: Chromium shows no data during
// dragover, and a drop on the canvas iframe must not hand the absolute root to the canvas's script (SECURITY.md 'Scope').
export const CANVAS_DRAG_TYPE = "application/x-doan-canvas-row";

// judge: App's canvasChipTarget for this row against a composer, so a drop and the row menu give the same reason.
export interface CanvasDrag { root: string; path: string; id: string; judge(composer: CanvasChipComposer): string | null }
export type ChipComposerPlace = "canvas" | "overview" | "home";
export interface ChipComposer extends CanvasChipComposer { insert(anchor: Anchor): ChipInsert }

let current: CanvasDrag | null = null;
const listeners = new Set<() => void>();
const composers: { place: ChipComposerPlace; composer: ChipComposer }[] = [];
const notify = () => { for (const listener of [...listeners]) listener(); };

// Drags and composer registrations both.
export function onCanvasChips(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function canvasDragging(): boolean { return current !== null; }

// A row drawn again mid-drag may never get its dragend, so the window's dragend, a drop anywhere and the next press
// end the drag too; a drag left in memory would keep the board shielded.
const ENDS = ["dragend", "drop", "pointerdown"] as const;
function stopWatching(): void {
  if (typeof window === "undefined") return;
  for (const type of ENDS) window.removeEventListener(type, endCanvasDrag);
}

// doc: the source row's document, where the chip-shaped drag image is drawn.
export function beginCanvasDrag(drag: CanvasDrag, data: DataTransfer, doc?: Document): void {
  stopWatching();
  current = drag;
  data.setData(CANVAS_DRAG_TYPE, "");
  data.effectAllowed = "copy";
  if (doc) setChipImage(doc, data, { canvas: { path: drag.path, id: drag.id } });
  // Bubbling: the composer's own drop reads the drag before the window's listener ends it.
  if (typeof window !== "undefined") for (const type of ENDS) window.addEventListener(type, endCanvasDrag);
  notify();
}

export function endCanvasDrag(): void {
  stopWatching();
  if (current === null) return;
  current = null;
  notify();
}

// null: not a canvas row drag (files, text). "foreign": the marker without a drag in memory (another window or app).
export function canvasDragOf(data: Pick<DataTransfer, "types"> | null): CanvasDrag | "foreign" | null {
  if (!data || !Array.from(data.types).includes(CANVAS_DRAG_TYPE)) return null;
  return current ?? "foreign";
}

// refused null: nothing to say (a foreign drag).
export function canvasDropDecision(data: Pick<DataTransfer, "types"> | null, composer: CanvasChipComposer | null): { anchor: Anchor } | { refused: string | null } | null {
  const drag = canvasDragOf(data);
  if (drag === null) return null;
  if (drag === "foreign" || composer === null) return { refused: null };
  const reason = drag.judge(composer);
  return reason === null ? { anchor: { canvas: { path: drag.path, id: drag.id } } } : { refused: reason };
}

// The latest composer of a place is the shown one; the one before it comes back when it leaves.
export function registerChipComposer(place: ChipComposerPlace, composer: ChipComposer): () => void {
  const entry = { place, composer };
  composers.push(entry);
  notify();
  return () => {
    const at = composers.indexOf(entry);
    if (at < 0) return;
    composers.splice(at, 1);
    notify();
  };
}

export function chipComposer(place: ChipComposerPlace): ChipComposer | null {
  return [...composers].reverse().find(entry => entry.place === place)?.composer ?? null;
}

// The chip as it will land, lifted. setDragImage snapshots a rendered element, so it is drawn off screen for the call.
const IMAGE_OFFSET = { x: 20, y: 23 };
function setChipImage(doc: Document, data: DataTransfer, anchor: Anchor): void {
  const image = doc.createElement("span");
  image.className = "chip-drag-image";
  image.setAttribute("aria-hidden", "true");
  image.append(chipNode(anchor, doc));
  doc.body.append(image);
  try { data.setDragImage(image, IMAGE_OFFSET.x, IMAGE_OFFSET.y); } finally { setTimeout(() => image.remove(), 0); }
}

// The composer's side of a canvas row drag: it registers with App while it takes canvas chips, takes a drop outside its
// text at the caret (the field takes one on its text), and keeps the reason line while a refused drag is over it.
export function useCanvasChipDrop(input: {
  place: ChipComposerPlace | null; root: string | null;
  field: RefObject<ComposerFieldHandle | null>;
  takes(anchor: Anchor): string | null;
  onLimit(): void;
}): { handlers: Record<"onDragEnter" | "onDragOver" | "onDragLeave" | "onDrop", (event: DragEvent<HTMLElement>) => void>; refusal: string | null; fieldDrag(data: DataTransfer): Anchor | "refused" | null } {
  const latest = useRef(input);
  latest.current = input;
  const [refusal, setRefusal] = useState<string | null>(null);
  const depth = useRef(0);
  const [composer] = useState<ChipComposer>(() => ({
    get root() { return latest.current.root ?? ""; },
    canTake: anchor => latest.current.takes(anchor),
    insert: anchor => {
      const field = latest.current.field.current;
      const result = field?.insertChip(anchor) ?? "refused";
      if (result === "inserted") field?.focus();
      else if (result === "limit") latest.current.onLimit();
      return result;
    },
  }));
  const { place, root } = input;
  useEffect(() => place && root ? registerChipComposer(place, composer) : undefined, [place, root, composer]);
  useEffect(() => onCanvasChips(() => { if (!canvasDragging()) { depth.current = 0; setRefusal(null); } }), []);
  const decide = (data: Pick<DataTransfer, "types"> | null) => canvasDropDecision(data, latest.current.root ? composer : null);
  const onText = (event: DragEvent<HTMLElement>) => event.target instanceof Node && !!latest.current.field.current?.element()?.contains(event.target);
  const reasonOf = (decision: { anchor: Anchor } | { refused: string | null }) => "refused" in decision ? decision.refused : null;
  const handlers = {
    onDragEnter: (event: DragEvent<HTMLElement>) => {
      const decision = decide(event.dataTransfer);
      if (!decision) return;
      depth.current++;
      setRefusal(reasonOf(decision));
    },
    // The field sets the transfer over its text (chipField chipDrag); the rest of the composer is set here.
    onDragOver: (event: DragEvent<HTMLElement>) => {
      const decision = decide(event.dataTransfer);
      if (!decision) return;
      setRefusal(reasonOf(decision));
      if (onText(event)) return;
      if ("anchor" in decision) event.preventDefault();
      event.dataTransfer.dropEffect = "anchor" in decision ? "copy" : "none";
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (!decide(event.dataTransfer)) return;
      if (--depth.current <= 0) { depth.current = 0; setRefusal(null); }
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      const decision = decide(event.dataTransfer);
      if (!decision) return;
      depth.current = 0;
      setRefusal(null);
      if (onText(event) || !("anchor" in decision)) return;
      event.preventDefault();
      composer.insert(decision.anchor);
    },
  };
  const fieldDrag = (data: DataTransfer) => {
    const decision = decide(data);
    return decision === null ? null : "anchor" in decision ? decision.anchor : "refused";
  };
  return { handlers, refusal, fieldDrag };
}
