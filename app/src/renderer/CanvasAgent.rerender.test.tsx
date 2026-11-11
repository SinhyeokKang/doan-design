import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

// .doan/canvases/doany-family.html: Doany's variant is picked when the notice mounts and held while it stays, so
// working, stopping, waiting and terminal show the same one; a change of buddy swaps the notice's picture at once. There is no DOM in these tests (no jsdom), so this is not
// a real mounted re-render: the artist body runs several times with its hooks kept by call order, as React keeps them.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [hooks.slots[index], (next: unknown) => { hooks.slots[index] = next; }];
    },
  };
});
const { BuddyArtist } = await import("./CanvasAgent");
type BuddyId = import("./buddies").BuddyId;

// Runs the artist once and returns the src of the picture's img.
function run(still: boolean, buddy: BuddyId = "doany"): string {
  hooks.cursor = 0;
  const find = (node: ReactNode): string | undefined => {
    if (!node || typeof node !== "object" || !("props" in node)) return undefined;
    const element = node as ReactElement<{ src?: string; children?: ReactNode }>;
    if (element.type === "img") return element.props.src;
    const children = element.props.children;
    for (const child of Array.isArray(children) ? children : [children]) { const src = find(child as ReactNode); if (src) return src; }
    return undefined;
  };
  return find(BuddyArtist({ buddy, still })) ?? "";
}

beforeEach(() => { hooks.slots = []; });
afterEach(() => { vi.restoreAllMocks(); });

test("the variant picked on mount stays through working, waiting and working again", () => {
  const random = vi.spyOn(Math, "random").mockReturnValue(0.34);
  expect(run(false)).toBe("doany/artist-typing.gif");
  random.mockReturnValue(0.99);
  expect(run(true)).toBe("doany/artist-typing-rest.png");
  expect(run(false)).toBe("doany/artist-typing.gif");
});

test("a new mount picks again, a repeat allowed", () => {
  const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
  expect(run(false)).toBe("doany/artist-reading.gif");
  hooks.slots = [];
  random.mockReturnValue(0);
  expect(run(false)).toBe("doany/artist-painting.gif");
  hooks.slots = [];
  expect(run(false)).toBe("doany/artist-painting.gif");
});

test("a change of buddy while the notice shows swaps its picture; back to Doany picks again", () => {
  const random = vi.spyOn(Math, "random").mockReturnValue(0.34);
  expect(run(false)).toBe("doany/artist-typing.gif");
  expect(run(false, "puri")).toBe("buddies/puri/artist-typing.gif");
  expect(run(true, "puri")).toBe("buddies/puri/artist-typing-rest.png");
  random.mockReturnValue(0.99);
  expect(run(false, "doany")).toBe("doany/artist-reading.gif");
  random.mockReturnValue(0);
  expect(run(false, "doany")).toBe("doany/artist-reading.gif");
});
