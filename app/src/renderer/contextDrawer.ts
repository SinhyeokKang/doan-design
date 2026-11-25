import type { Provider } from "../main/agentAuth/types";
import type { UsageEntry } from "../main/agentAuth/usageTypes";
import { rowView, usageBusy, type RowView } from "./agentUsageView";
import { contextText, tokenText, type ContextUsage } from "./contextWindow";
import { ringDanger } from "./ProgressRing";

export interface ContextLineView { label: string; text: string; bar: number; full: boolean }
export interface ContextDrawerView { context: ContextLineView; usage: RowView | null; busy: boolean }

// usageHidden: a legacy external conversation or a terminal session runs on the person's CLI profile, so a Doan
// connection's usage is not this conversation's.
export function contextDrawerView({ context, provider, usageHidden, entries, now }: {
  context: ContextUsage; provider: Provider | null; usageHidden: boolean; entries: readonly UsageEntry[]; now: number;
}): ContextDrawerView {
  const { used, size } = context;
  const line = { label: "Context window", text: `${Math.floor(used * 100 / size)}% used · ${tokenText(used)} of ${tokenText(size)}`, bar: context.value, full: ringDanger(context.percent) };
  const entry = usageHidden || provider === null || provider === "antigravity" ? undefined : entries.find(candidate => candidate.provider === provider);
  if (!entry) return { context: line, usage: null, busy: false };
  // Refresh joins a read already running, so any read shows it busy, as in the header.
  return { context: line, usage: rowView(entry, now), busy: usageBusy(entries) };
}

export interface RingButtonProps { "aria-label": string; "aria-description": string; "aria-haspopup": "dialog"; "aria-expanded": boolean }
// No recorded value, or a composer turned into a status line: no ring, so no button and no drawer.
export function ringButton(context: ContextUsage | null, { statusLine, open }: { statusLine: boolean; open: boolean }): RingButtonProps | null {
  if (!context || statusLine) return null;
  const { label, tokens } = contextText(context);
  return { "aria-label": label, "aria-description": tokens, "aria-haspopup": "dialog", "aria-expanded": open };
}

// quiet holds back only the focus a drawer's close hands back to the ring; any hover, and focus leaving, clear it.
export interface RingTip { tip: boolean; drawer: boolean; quiet: boolean }
export const RING_TIP: RingTip = { tip: false, drawer: false, quiet: false };
// A pointer press's focus asks for nothing: the press opens the drawer.
export type RingTipEvent =
  | { type: "drawer"; open: boolean; focusReturns?: boolean }
  | { type: "focus"; keyboard: boolean }
  | { type: "hover" }
  | { type: "dismiss" };

export function ringTip(state: RingTip, event: RingTipEvent): RingTip {
  switch (event.type) {
    case "drawer": return { tip: false, drawer: event.open, quiet: !event.open && event.focusReturns === true };
    case "focus": return state.quiet ? { ...state, tip: false, quiet: false } : { ...state, tip: state.tip || (event.keyboard && !state.drawer) };
    case "hover": return { ...state, tip: !state.drawer, quiet: false };
    case "dismiss": return { ...state, tip: false, quiet: false };
  }
}

export function ringTipOpen(state: RingTip): boolean {
  return state.tip && !state.drawer;
}

// The ring or the conversation going sends focus that was inside to the composer input.
export type DrawerClose = { kind: "escape" } | { kind: "outside"; focusedControl: boolean } | { kind: "lost"; focusInside: boolean };
export function drawerCloseFocus(close: DrawerClose): "ring" | "composer" | "stay" {
  switch (close.kind) {
    case "escape": return "ring";
    case "outside": return close.focusedControl ? "stay" : "ring";
    case "lost": return close.focusInside ? "composer" : "stay";
  }
}

// The drawer stays, and focus that was on Refresh goes to the drawer body rather than falling to the page.
export function refreshGoneFocus({ row, refreshFocused }: { row: boolean; refreshFocused: boolean }): "body" | "stay" {
  return !row && refreshFocused ? "body" : "stay";
}
