import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { BUDDY_IDS, EYE_TEXTURE, buddy } from "./buddies";

// The app copies in public/buddies/ are made from .doan/assets/buddies/ (public/doany/README.md says how); a path the
// registry names but the build does not ship would leave a buddy without its still, layers or working notice.
const PUBLIC = fileURLToPath(new URL("./public/", import.meta.url));
const SOURCES = fileURLToPath(new URL("../../../.doan/assets/buddies/", import.meta.url));
const file = (path: string) => readFileSync(join(PUBLIC, path));

function pngHeader(bytes: Buffer) {
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(bytes.toString("latin1", 12, 16)).toBe("IHDR");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), depth: bytes[24], colour: bytes[25] };
}
const RGBA = 6, RGB = 2;

// Frame count and per-frame delays (centiseconds) of a GIF, read block by block.
function gif(bytes: Buffer) {
  expect(bytes.toString("latin1", 0, 6)).toBe("GIF89a");
  const width = bytes.readUInt16LE(6), height = bytes.readUInt16LE(8), flags = bytes[10]!;
  let offset = 13 + (flags & 0x80 ? 3 * 2 ** ((flags & 7) + 1) : 0);
  const delays: number[] = [];
  let delay = 0;
  const skipSubBlocks = () => { while (bytes[offset]) offset += bytes[offset]! + 1; offset++; };
  for (;;) {
    const block = bytes[offset++];
    if (block === 0x3b) break;
    if (block === 0x21) {
      const label = bytes[offset++];
      if (label === 0xf9) delay = bytes.readUInt16LE(offset + 2);
      skipSubBlocks();
    } else if (block === 0x2c) {
      const local = bytes[offset + 8]!;
      offset += 9 + (local & 0x80 ? 3 * 2 ** ((local & 7) + 1) : 0) + 1;
      skipSubBlocks();
      delays.push(delay);
      delay = 0;
    } else throw new Error(`unexpected GIF block ${block}`);
  }
  return { width, height, delays };
}

test("every asset path the registry names is shipped in public/", () => {
  const paths = [EYE_TEXTURE, ...BUDDY_IDS.flatMap(id => { const { assets, artists } = buddy(id); return [...Object.values(assets), ...artists.flatMap(a => [a.gif, a.rest])]; })];
  for (const path of paths) expect(existsSync(join(PUBLIC, path)), path).toBe(true);
});

test("the friends' still, layers and shadow and Doany's shadow are 512² RGBA; every card is 588²", () => {
  for (const id of BUDDY_IDS) {
    const { assets } = buddy(id);
    for (const path of [assets.still, assets.body, assets.accessory, assets.shadow].filter(path => path.startsWith("buddies/"))) {
      expect(pngHeader(file(path)), path).toEqual({ width: 512, height: 512, depth: 8, colour: RGBA });
    }
    const card = pngHeader(file(assets.card));
    expect([card.width, card.height, card.depth], assets.card).toEqual([588, 588, 8]);
    expect([RGB, RGBA], assets.card).toContain(card.colour);
  }
  expect(buddy("doany").assets.shadow.startsWith("buddies/")).toBe(true);
});

test("the friends' working-notice GIFs are 128² with the source's frames and timing, and their rest frames are 128² RGBA", () => {
  for (const id of BUDDY_IDS.filter(id => id !== "doany")) {
    for (const { gif: path, rest } of buddy(id).artists) {
      const shipped = gif(file(path)), source = gif(readFileSync(join(SOURCES, id, "artist.gif")));
      expect([shipped.width, shipped.height], path).toEqual([128, 128]);
      expect(shipped.delays, path).toEqual(source.delays);
      expect(shipped.delays.length, path).toBeGreaterThan(1);
      expect(pngHeader(file(rest)), rest).toEqual({ width: 128, height: 128, depth: 8, colour: RGBA });
    }
  }
});

test("eye.png is the shared eye, unchanged from its source", () => {
  expect(file(EYE_TEXTURE).equals(readFileSync(join(SOURCES, "eye.png")))).toBe(true);
  expect(pngHeader(file(EYE_TEXTURE))).toMatchObject({ width: 118, height: 193, colour: RGBA });
});

test("public/buddies/ stays within 5 MB, Welcome's group photo aside", () => {
  // Lossless copies by the maintainer's choice: palette compression would bring it near 2 MB but alter the artwork.
  // The cap was set for the buddies' own layers; the group photo in group/ is one lossless picture outside it.
  const size = (dir: string): number => readdirSync(dir).reduce((sum, name) => { const path = join(dir, name); return sum + (path === join(PUBLIC, "buddies", "group") ? 0 : statSync(path).isDirectory() ? size(path) : statSync(path).size); }, 0);
  expect(size(join(PUBLIC, "buddies"))).toBeLessThanOrEqual(5_000_000);
});
