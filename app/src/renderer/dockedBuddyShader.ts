// SPDX-License-Identifier: MIT
// Home's templates plus .doan/assets/buddies/docked-poc.js's two lines that pin squash and tilt to the foot contact.
// dockedBuddyShader.test.ts compares every buddy's source with the asset's byte for byte.
import type { BuddyRig } from "./buddies";
import { fragmentFor, vertexFor } from "./Doany";

export const DOCKED_ANCHOR = "q += vec2(0.,.10-lift);";

// Replacing nothing would compile Home's shader without the pin, and nothing on screen would say so until a buddy's
// feet left the floor.
export function dockedVertex(home: string, rig: BuddyRig) {
  if (home.split(DOCKED_ANCHOR).length !== 2) throw new Error("Docked shader anchor not found exactly once");
  const [x, y] = rig.contact;
  return home.replace(DOCKED_ANCHOR, `q.y += (${y}-.60)*squash-squash*.36;
      q.y -= sin(tilt)*(${x}-.5)*(1.+squash)+(cos(tilt)-1.)*((${y}-.60)*(1.-squash)+squash*.36);
      ${DOCKED_ANCHOR}`);
}

export function dockedShaders(rig: BuddyRig) {
  return { vertex: dockedVertex(vertexFor(rig), rig), fragment: fragmentFor(rig) };
}
