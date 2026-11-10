// The buddy registry: the one list of buddies every screen reads (Buddy step, buddy screen, Settings > General,
// Home, the working notice). A screen branches on what the registry says, never on a buddy's id. Pure, so main
// (preferences) reads it by value too.

export type BuddyId = "doany" | "puri" | "dungdung" | "popo" | "dori";
// The default order, used everywhere but first run's Cover Flow row.
export const BUDDY_IDS: readonly BuddyId[] = ["doany", "puri", "dungdung", "popo", "dori"];
// First run's row puts Doany, the default, in the middle so all five show on the first visit.
export const FIRST_RUN_ORDER: readonly BuddyId[] = ["popo", "puri", "doany", "dungdung", "dori"];

// Paths are relative to the renderer's public folder. Doany's motion assets stay in doany/: its golden trace records
// their file names, and canvases and the serve config read them there.
export interface BuddyAssets { still: string; body: string; accessory: string; shadow: string; card: string }
// UV of the 1254² layers. Values the shader source takes are strings in the draft's own notation (".10", not "0.1"),
// so a buddy's compiled source matches .doan/assets/buddies/motion-preview.js byte for byte.
export interface BuddyRig {
  eyes: readonly [string, string];
  radius: readonly [string, string];
  gaze: string;
  skew: string;
  bodyPivot: string;
  accessoryPivot: string;
  scale: string;
  neutral: string;
  padding: string;
  // Radians; a scarf or headphones wrap the body, so they swing less, and glasses would leave the eyes when tilted.
  accessoryTilt: readonly [number, number];
  liftScale: number;
  // The ground contact the floor shadow shrinks about during a hop: centre x and alpha bottom y.
  contact: readonly [number, number];
}
export interface ArtistVariant { gif: string; rest: string }
export interface Buddy { id: BuddyId; name: string; line: string; assets: BuddyAssets; rig: BuddyRig; artists: readonly ArtistVariant[] }

// One eye for every buddy, cut from Puri's still.
export const EYE_TEXTURE = "buddies/eye.png";

const SHARED = { gaze: ".018,.014", skew: ".018", bodyPivot: ".5,.60", scale: "1.34", neutral: ".10", padding: "16.5%" } as const;
const friendAssets = (id: BuddyId): BuddyAssets => ({ still: `buddies/${id}/still.png`, body: `buddies/${id}/body.png`, accessory: `buddies/${id}/accessory.png`, shadow: `buddies/${id}/shadow.png`, card: `buddies/${id}/card.png` });
const painter = (id: BuddyId): readonly ArtistVariant[] => [{ gif: `buddies/${id}/artist.gif`, rest: `buddies/${id}/artist-rest.png` }];

// Rig numbers: Doany's from .doan/assets/doany/v2/README.md, the friends' from .doan/assets/buddies/README.md.
const REGISTRY: Record<BuddyId, Buddy> = {
  doany: {
    id: "doany", name: "Doany", line: "A little artist in a beret who just loves to draw.",
    assets: { still: "doany/doany.png", body: "doany/body.png", accessory: "doany/hat.png", shadow: "buddies/doany/shadow.png", card: "buddies/doany/card.png" },
    rig: { ...SHARED, eyes: [".421,.550", ".619,.550"], radius: [".035", ".056"], accessoryPivot: ".67,.30", accessoryTilt: [-.3, .15], liftScale: .9, contact: [.458, .941] },
    artists: [
      { gif: "doany/artist-painting.gif", rest: "doany/artist-rest.png" },
      { gif: "doany/artist-typing.gif", rest: "doany/artist-typing-rest.png" },
      { gif: "doany/artist-reading.gif", rest: "doany/artist-reading-rest.png" },
    ],
  },
  puri: {
    id: "puri", name: "Puri", line: "A curious walking companion who shares every fun find.", assets: friendAssets("puri"),
    rig: { ...SHARED, eyes: [".433,.528", ".607,.528"], radius: [".034", ".057"], accessoryPivot: ".515,.307", accessoryTilt: [-.12, .12], liftScale: .9, contact: [.498, .847] },
    artists: painter("puri"),
  },
  dungdung: {
    id: "dungdung", name: "Dungdung", line: "A music-loving mood maker who keeps things upbeat.", assets: friendAssets("dungdung"),
    rig: { ...SHARED, eyes: [".404,.482", ".585,.482"], radius: [".033", ".057"], accessoryPivot: ".5,.43", accessoryTilt: [-.025, .025], liftScale: .9, contact: [.494, .86] },
    artists: painter("dungdung"),
  },
  popo: {
    id: "popo", name: "Popo", line: "A whimsical bookworm who dreams up new games.", assets: friendAssets("popo"),
    rig: { ...SHARED, eyes: [".411,.42", ".607,.42"], radius: [".032", ".055"], accessoryPivot: ".503,.42", accessoryTilt: [0, 0], liftScale: .9, contact: [.494, .858] },
    artists: painter("popo"),
  },
  dori: {
    id: "dori", name: "Dori", line: "A quiet, caring friend to lean on when you’re tired.", assets: friendAssets("dori"),
    rig: { ...SHARED, eyes: [".424,.364", ".563,.365"], radius: [".027", ".045"], accessoryPivot: ".51,.535", accessoryTilt: [-.02, .02], liftScale: .65, contact: [.504, .888] },
    artists: painter("dori"),
  },
};

export function knownBuddyId(value: unknown): value is BuddyId { return (BUDDY_IDS as readonly unknown[]).includes(value); }
// An id from a later build, or anything else, shows Doany.
export function parseBuddyId(value: unknown): BuddyId { return knownBuddyId(value) ? value : "doany"; }
export function buddy(id: BuddyId): Buddy { return REGISTRY[id]; }

export interface PickedArtist { buddy: BuddyId; variant: ArtistVariant }
// The working notice holds its variant while the buddy stays, so working, stopping and waiting keep one picture;
// a change of buddy picks again.
export function pickArtist(id: BuddyId, previous: PickedArtist | null, random: () => number): PickedArtist {
  if (previous?.buddy === id) return previous;
  const artists = REGISTRY[id].artists;
  return { buddy: id, variant: artists[Math.min(artists.length - 1, Math.floor(random() * artists.length))]! };
}
