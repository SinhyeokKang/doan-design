import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { buddyBox, clipWindow, onSilhouette, overlaps, type Box } from "./dockedBuddyHit";

// Overlap cases come from the docked draft .doan/assets/buddies/docked-poc.js run in a vm
// (app/scripts/dockedBuddyGolden.mjs).
const golden = JSON.parse(readFileSync(new URL("./dockedBuddy.golden.json", import.meta.url), "utf8")) as {
  overlaps: { box: Box; rects: Box[]; overlaps: boolean }[];
};
const SURFACE = { left: 100, right: 460, top: 500 };

test("the buddy's box and clip window match the draft", () => {
  expect(buddyBox(SURFACE, 16)).toEqual(golden.overlaps[0]!.box);
  expect(clipWindow(SURFACE)).toEqual(golden.overlaps.at(-1)!.box);
  for (const item of golden.overlaps) expect(overlaps(item.box, item.rects), JSON.stringify(item)).toBe(item.overlaps);
});

test("overlap: intersecting, touching, apart and an empty list", () => {
  const box = buddyBox(SURFACE, 16); // left 116, right 172, top 443, bottom 499
  expect(overlaps(box, [{ left: 150, right: 250, top: 420, bottom: 450 }])).toBe(true);
  expect(overlaps(box, [{ left: 172, right: 250, top: 420, bottom: 450 }])).toBe(false);
  expect(overlaps(box, [{ left: 50, right: 116, top: 420, bottom: 450 }])).toBe(false);
  expect(overlaps(box, [{ left: 150, right: 250, top: 499, bottom: 520 }])).toBe(false);
  expect(overlaps(box, [{ left: 300, right: 400, top: 420, bottom: 450 }])).toBe(false);
  expect(overlaps(box, [])).toBe(false);
  // An empty rect (a closed popper keeps its wrapper) never counts.
  expect(overlaps(box, [{ left: 150, right: 150, top: 420, bottom: 450 }])).toBe(false);
});

// A 4×4 silhouette: only pixel (1, 1) is opaque, (2, 1) sits at the alpha threshold.
const pixels = new Uint8ClampedArray(4*4*4);
pixels[(1*4 + 1)*4 + 3] = 255;
pixels[(1*4 + 2)*4 + 3] = 32;
pixels[(2*4 + 1)*4 + 3] = 33;
const mask = { data: pixels, width: 4, height: 4 };
// A 100px host: the rig's 16.5% padding leaves a 67px square, so each mask pixel is 16.75px.
const host = { left: 10, top: 20, width: 100, height: 100 };
const at = (ix: number, iy: number): [number, number] => [host.left + 16.5 + 16.75*(ix + .5), host.top + 16.5 + 16.75*(iy + .5)];

test("silhouette: an opaque pixel takes the click", () => {
  expect(onSilhouette(mask, host, "shown", ...at(1, 1))).toBe(true);
  expect(onSilhouette(mask, host, "shown", ...at(1, 2))).toBe(true);
});

test("silhouette: transparent pixels and the alpha threshold let the click through", () => {
  expect(onSilhouette(mask, host, "shown", ...at(0, 0))).toBe(false);
  expect(onSilhouette(mask, host, "shown", ...at(2, 1))).toBe(false);
});

test("silhouette: the padding and the outside of the box let the click through", () => {
  expect(onSilhouette(mask, host, "shown", host.left + 5, host.top + 50)).toBe(false);
  expect(onSilhouette(mask, host, "shown", host.left - 20, host.top + 50)).toBe(false);
  expect(onSilhouette(mask, host, "shown", host.left + 50, host.top + 200)).toBe(false);
});

test("silhouette: only a fully shown buddy with a read mask takes the click", () => {
  for (const presence of ["hiding", "waiting", "revealing", "hidden"] as const) expect(onSilhouette(mask, host, presence, ...at(1, 1)), presence).toBe(false);
  expect(onSilhouette(null, host, "shown", ...at(1, 1))).toBe(false);
});

test("silhouette: a non-square mask is centred in the padded box", () => {
  // 4 wide, 2 tall: scale 16.75, centred vertically with (67 - 33.5)/2 above.
  const wide = { data: new Uint8ClampedArray(4*2*4), width: 4, height: 2 };
  wide.data[(0*4 + 3)*4 + 3] = 255;
  const top = host.top + 16.5 + (67 - 2*16.75)/2;
  expect(onSilhouette(wide, host, "shown", host.left + 16.5 + 16.75*3.5, top + 16.75*.5)).toBe(true);
  expect(onSilhouette(wide, host, "shown", host.left + 16.5 + 16.75*3.5, top - 2)).toBe(false);
});
