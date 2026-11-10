import { parseBuddyId, type BuddyId } from "./buddies";

// Main opens the window with ?buddy=<id> so the first frame already has the saved buddy's accent; App applies the
// preferences snapshot after that, so a reload follows what is saved, not the query.
export function firstPaintBuddy(search: string): BuddyId { return parseBuddyId(new URLSearchParams(search).get("buddy")); }

// What the renderer entry hands App: the buddy it painted first, and how to paint another.
export interface BuddyPaint { first: BuddyId; apply(id: BuddyId): void }

// Doany is the :root default, so it has no attribute.
export function applyBuddy(root: Pick<Element, "setAttribute" | "removeAttribute">, id: BuddyId): void {
  if (id === "doany") root.removeAttribute("data-buddy");
  else root.setAttribute("data-buddy", id);
}
