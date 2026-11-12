import { expect, test } from "vitest";
import { BUDDY_IDS, buddy, EYE_TEXTURE, FIRST_RUN_ORDER, knownBuddyId, parseBuddyId, pickArtist } from "./buddies";

test("the registry lists the five buddies in the default order; first run's row has its own order", () => {
  expect(BUDDY_IDS).toEqual(["doany", "puri", "dungdung", "popo", "dori"]);
  expect(FIRST_RUN_ORDER).toEqual(["popo", "puri", "doany", "dungdung", "dori"]);
  expect([...FIRST_RUN_ORDER].sort()).toEqual([...BUDDY_IDS].sort());
});

test("an unknown value or a non-string reads as Doany", () => {
  for (const id of BUDDY_IDS) expect(parseBuddyId(id)).toBe(id);
  for (const value of [undefined, null, "", "Doany", "PURI", "nemo", " puri", 1, true, {}, ["puri"]]) expect(parseBuddyId(value)).toBe("doany");
  for (const id of BUDDY_IDS) expect(knownBuddyId(id)).toBe(true);
  for (const value of [undefined, null, "", "nemo", "toString", "constructor", 1, {}]) expect(knownBuddyId(value)).toBe(false);
});

test("each buddy has its name and one line", () => {
  expect(BUDDY_IDS.map(id => [buddy(id).name, buddy(id).line])).toEqual([
    ["Doany", "A little artist in a beret who just loves to draw."],
    ["Puri", "A curious walking companion who shares every fun find."],
    ["Dungdung", "A music-loving mood maker who keeps things upbeat."],
    ["Popo", "A whimsical bookworm who dreams up new games."],
    ["Dori", "A quiet, caring friend to lean on when you’re tired."],
  ]);
});

test("Doany's motion assets stay in public/doany; its card and shadow and every friend's set live in public/buddies", () => {
  expect(buddy("doany").assets).toEqual({ still: "doany/doany.png", body: "doany/body.png", accessory: "doany/hat.png", shadow: "buddies/doany/shadow.png", card: "buddies/doany/card.png" });
  for (const id of ["puri", "dungdung", "popo", "dori"] as const) {
    expect(buddy(id).assets).toEqual({ still: `buddies/${id}/still.png`, body: `buddies/${id}/body.png`, accessory: `buddies/${id}/accessory.png`, shadow: `buddies/${id}/shadow.png`, card: `buddies/${id}/card.png` });
  }
  expect(EYE_TEXTURE).toBe("buddies/eye.png");
});

test("the rig numbers keep the draft's notation, so the shader source matches the draft byte for byte", () => {
  const shared = { gaze: ".018,.014", skew: ".018", bodyPivot: ".5,.60", scale: "1.34", neutral: ".10", padding: "16.5%" };
  expect(buddy("doany").rig).toEqual({ ...shared, eyes: [".421,.550", ".619,.550"], radius: [".035", ".056"], accessoryPivot: ".67,.30", accessoryTilt: [-.3, .15], liftScale: .9, contact: [.458, .941] });
  expect(buddy("puri").rig).toEqual({ ...shared, eyes: [".433,.528", ".607,.528"], radius: [".034", ".057"], accessoryPivot: ".515,.307", accessoryTilt: [-.12, .12], liftScale: .9, contact: [.498, .847] });
  expect(buddy("dungdung").rig).toEqual({ ...shared, eyes: [".404,.482", ".585,.482"], radius: [".033", ".057"], accessoryPivot: ".5,.43", accessoryTilt: [-.025, .025], liftScale: .9, contact: [.494, .86] });
  expect(buddy("popo").rig).toEqual({ ...shared, eyes: [".411,.42", ".607,.42"], radius: [".032", ".055"], accessoryPivot: ".503,.42", accessoryTilt: [0, 0], liftScale: .9, contact: [.494, .858] });
  expect(buddy("dori").rig).toEqual({ ...shared, eyes: [".424,.364", ".563,.365"], radius: [".027", ".045"], accessoryPivot: ".51,.535", accessoryTilt: [-.02, .02], liftScale: .65, contact: [.504, .888] });
});

test("every buddy paints, types or reads in the working notice", () => {
  expect(buddy("doany").artists).toEqual([
    { gif: "doany/artist-painting.gif", rest: "doany/artist-rest.png" },
    { gif: "doany/artist-typing.gif", rest: "doany/artist-typing-rest.png" },
    { gif: "doany/artist-reading.gif", rest: "doany/artist-reading-rest.png" },
  ]);
  for (const id of ["puri", "dungdung", "popo", "dori"] as const) expect(buddy(id).artists).toEqual([
    { gif: `buddies/${id}/artist.gif`, rest: `buddies/${id}/artist-rest.png` },
    { gif: `buddies/${id}/artist-typing.gif`, rest: `buddies/${id}/artist-typing-rest.png` },
    { gif: `buddies/${id}/artist-reading.gif`, rest: `buddies/${id}/artist-reading-rest.png` },
  ]);
});

test("pickArtist keeps the variant while the buddy stays and picks again when it changes", () => {
  const doany = buddy("doany").artists;
  const first = pickArtist("doany", null, () => .5);
  expect(first).toEqual({ buddy: "doany", variant: doany[1] });
  expect(pickArtist("doany", null, () => 0).variant).toBe(doany[0]);
  // Math.random never returns 1, but a random source that does still lands on a variant.
  expect(pickArtist("doany", null, () => .999).variant).toBe(doany[2]);
  expect(pickArtist("doany", null, () => 1).variant).toBe(doany[2]);
  // Same buddy: the shown variant is held, whatever the random source says.
  expect(pickArtist("doany", first, () => 0)).toBe(first);
  const puri = pickArtist("puri", first, () => .7);
  expect(puri).toEqual({ buddy: "puri", variant: buddy("puri").artists[2] });
  // Back to Doany: a new random pick.
  expect(pickArtist("doany", puri, () => .1)).toEqual({ buddy: "doany", variant: doany[0] });
});
