import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Check, Checks } from "../../lib/types.ts";

const DIR = import.meta.dirname;
const CANVAS = ".doan/canvases/drafts.html";
const turn = JSON.parse(readFileSync(join(DIR, "turn.json"), "utf8"));
const point: { frameId: string; dx: number; dy: number } = turn.anchors[1].point;
// The frame's padding (--space-4 in the seed). A badge placed from the frame's content
// box instead of its border box lands this far off; the prompt does not say which
// origin the offset uses, so that reading still counts as "at that spot". Content that
// simply follows the existing elements lands more than 100px away.
const TOLERANCE = 16;

type Rect = { x: number; y: number; width: number; height: number };
type Identity = { key: string; tag: string; parent: string | null; own: string; label: string };
type Layout = { frames: Record<string, Rect>; identities: Identity[]; badges: { frame: string | null; within: string | null; rect: Rect; html: string }[]; structure: Record<string, [string, string | null, string, string | null][]> };
// The anchored element: its label is scored with any markup inside it, and that markup is part of the label.
const ANCHORED = "id:save";

// Renders the seed and the final canvas in the app's Electron (layout.cjs).
function layouts(ctx: Parameters<Checks>[0], final: string, seed: string): Layout[] | string {
  let electron: string;
  try { electron = createRequire(join(DIR, "../../../app/package.json"))("electron"); } catch (error) { return `electron is not installed (npm --prefix app ci): ${(error as Error).message}`; }
  const tmp = mkdtempSync(join(tmpdir(), "doan-eval-r8-"));
  try {
    // The seed copy needs no stylesheet: only its structure is compared.
    writeFileSync(join(tmp, "seed.html"), seed);
    const width = /<meta\s+name="doan:width"\s+content="(\d+)"/.exec(final)?.[1] ?? "1200";
    const out: Layout[] = [];
    for (const file of [join(ctx.repo, CANVAS), join(tmp, "seed.html")]) {
      const result = ctx.run("/usr/bin/env", ["-u", "ELECTRON_RUN_AS_NODE", electron, join(DIR, "layout.cjs"), `--user-data-dir=${join(tmp, "electron")}`, width, file]);
      if (result.code !== 0) return `layout.cjs exit ${result.code} on ${file}: ${result.stderr.trim().slice(-500)}`;
      out.push(JSON.parse(result.stdout.trim().split("\n").pop()!));
    }
    return out;
  } catch (error) {
    return `layout failed: ${(error as Error).message}`;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const checks: Checks = ctx => {
  const check = ctx.doan(["check"]);
  const changed = ctx.changedFiles();
  const results: Check[] = [
    { id: "doan_check_clean", pass: check.code === 0 && check.json?.result?.summary?.errors === 0, detail: `exit ${check.code}, ${JSON.stringify(check.json?.result?.summary)}` },
    { id: "only_canvas_changed", pass: changed.length === 1 && changed[0] === CANVAS, detail: `changed: ${changed.join(", ") || "(none)"}` },
  ];
  const final = ctx.read(CANVAS), seed = ctx.seed(CANVAS)!;
  const measured = final === null ? "the canvas is missing" : layouts(ctx, final, seed);
  const ids = ["element_anchor_applied", "stale_selection_unchanged", "other_identities_unchanged", "seed_structure_kept", "badge_in_point_frame", "badge_at_point_offset"];
  if (typeof measured === "string") return [...results, ...ids.map(id => ({ id, pass: false, detail: measured }))];
  const [now, before] = measured as [Layout, Layout];
  const find = (l: Layout, key: string) => l.identities.filter(i => i.key === key);
  const saves = find(now, "id:save"), save = saves[0];
  const publish = find(now, "id:publish");
  // Every seed identity once, with its tag, parent and own text (the preservation comparison; `label` includes
  // descendants and is left out); the anchored button may change only its text.
  const kept = (i: Identity) => ({ key: i.key, tag: i.tag, parent: i.parent, own: i.key === ANCHORED ? "" : i.own });
  const moved = before.identities.filter(was => {
    const found = find(now, was.key);
    return found.length !== 1 || !same(kept(found[0]!), kept(was));
  }).map(i => i.key);
  // Per frame (and outside frames), the seed's elements must all remain in order with their tag, id and own text;
  // the anchored button's text is left out (element_anchor_applied scores it). Added elements are allowed and
  // listed: guide rule G asks for a note on the canvas about copy that is not in code, and the agent chooses where
  // it goes, so whether an addition is that note or an unrequested change is the judge's call.
  const masked = (l: Layout) => Object.fromEntries(Object.entries(l.structure).map(([frame, rows]) => [frame, rows
    .filter(([, key, , within]) => key !== null || within !== ANCHORED)
    .map(([tag, key, own]) => JSON.stringify([tag, key, key === ANCHORED ? "" : own]))]));
  const was = masked(before), is = masked(now);
  const structureChanged: string[] = [], added: string[] = [];
  for (const frame of new Set([...Object.keys(was), ...Object.keys(is)])) {
    const want = was[frame] ?? [], have = is[frame] ?? [];
    let i = 0;
    for (const row of have) if (i < want.length && row === want[i]) i++; else added.push(`${frame}: ${row}`);
    if (i < want.length) structureChanged.push(frame);
  }
  // A word of the anchored label wrapped on its own ("Save <span>draft</span>") is not a badge.
  const badges = now.badges.filter(b => b.within !== ANCHORED);
  const badge = badges.length === 1 ? badges[0]! : null;
  const frame = now.frames[point.frameId];
  let offset = "no single badge in the anchored frame";
  let atPoint = false;
  if (badge && frame && badge.frame === point.frameId) {
    const px = frame.x + point.dx, py = frame.y + point.dy, r = badge.rect;
    const outX = Math.max(r.x - px, 0, px - (r.x + r.width)), outY = Math.max(r.y - py, 0, py - (r.y + r.height));
    const inside = r.width > 0 && r.height > 0 && r.x >= frame.x && r.y >= frame.y && r.x + r.width <= frame.x + frame.width && r.y + r.height <= frame.y + frame.height;
    atPoint = inside && Math.max(outX, outY) <= TOLERANCE;
    offset = `badge box at (${Math.round(r.x - frame.x)}, ${Math.round(r.y - frame.y)}) ${Math.round(r.width)}x${Math.round(r.height)} in ${point.frameId}; point (${point.dx}, ${point.dy}) is ${Math.round(outX)}px/${Math.round(outY)}px outside it (tolerance ${TOLERANCE}px)${inside ? "" : "; the box leaves the frame"}`;
  }
  return [
    ...results,
    { id: "element_anchor_applied", pass: saves.length === 1 && save!.tag === "button" && save!.label === "Save draft", detail: `save: ${saves.length === 1 ? `<${save!.tag}> "${save!.label}"` : `${saves.length} elements`}` },
    { id: "stale_selection_unchanged", pass: publish.length === 1 && same(publish[0], find(before, "id:publish")[0]), detail: `doan active's selection (publish): ${JSON.stringify(publish)}` },
    { id: "other_identities_unchanged", pass: moved.length === 0, detail: moved.length ? `changed or missing: ${moved.join(", ")}` : "every seed frame and element id kept its tag, parent and text" },
    { id: "seed_structure_kept", pass: structureChanged.length === 0, detail: `${structureChanged.length ? `seed elements removed, changed or reordered in: ${structureChanged.join(", ")}` : "every seed element is still there, in order, with its text"}; added besides the badge: ${added.join("; ") || "(none)"}` },
    { id: "badge_in_point_frame", pass: !!badge && badge.frame === point.frameId, detail: `"Draft" elements: ${JSON.stringify(badges.map(b => ({ frame: b.frame, html: b.html })))}` },
    { id: "badge_at_point_offset", pass: atPoint, detail: offset },
  ];
};
export default checks;
