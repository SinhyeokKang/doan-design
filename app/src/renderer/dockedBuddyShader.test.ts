import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { BUDDY_IDS, buddy, type BuddyId } from "./buddies";
import { vertexFor } from "./Doany";
import { DOCKED_ANCHOR, dockedShaders, dockedVertex } from "./dockedBuddyShader";

// The sources come from the docked draft .doan/assets/buddies/docked-poc.js run in a vm
// (app/scripts/dockedBuddyGolden.mjs).
const golden = JSON.parse(readFileSync(new URL("./dockedBuddy.golden.json", import.meta.url), "utf8")) as {
  anchor: string; shaders: Record<BuddyId, { vertex: string; fragment: string }>;
};

test("each buddy's docked shaders are the draft's byte for byte", () => {
  expect(DOCKED_ANCHOR).toBe(golden.anchor);
  for (const id of BUDDY_IDS) expect(dockedShaders(buddy(id).rig), id).toEqual(golden.shaders[id]);
});

test("the docked vertex shader is Home's with the foot pin inserted before the anchor", () => {
  const rig = buddy("puri").rig;
  const home = vertexFor(rig), docked = dockedVertex(home, rig);
  expect(docked.startsWith(home.slice(0, home.indexOf(DOCKED_ANCHOR)))).toBe(true);
  expect(docked.endsWith(home.slice(home.indexOf(DOCKED_ANCHOR)))).toBe(true);
  expect(docked.split(DOCKED_ANCHOR)).toHaveLength(2);
});

test("a missing or repeated anchor throws instead of compiling Home's shader", () => {
  const rig = buddy("doany").rig, home = vertexFor(rig);
  expect(() => dockedVertex(home.replace(DOCKED_ANCHOR, ""), rig)).toThrow(/anchor/);
  expect(() => dockedVertex(home.replace(DOCKED_ANCHOR, DOCKED_ANCHOR + DOCKED_ANCHOR), rig)).toThrow(/anchor/);
});
