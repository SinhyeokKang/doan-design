// SPDX-License-Identifier: MIT
// The docked buddy's shader sources: Home's templates (Doany.tsx, the motion-preview.js draft's) with the docked
// draft's two lines (.doan/assets/buddies/docked-poc.js, MIT, Doan contributors) that pin squash and tilt to the
// buddy's foot contact, so the feet stay on the composer card's edge while it breathes and hops. Home's shaders are
// not changed. dockedBuddyShader.test.ts compares every buddy's source with the draft's byte for byte.
import type { BuddyRig } from "./buddies";
import { fragmentFor, vertexFor } from "./Doany";

export const DOCKED_ANCHOR = "q += vec2(0.,.10-lift);";

// Throws unless the anchor occurs exactly once: replacing nothing would compile Home's shader without the pin, and
// nothing on screen would say so until a buddy's feet left the floor.
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
