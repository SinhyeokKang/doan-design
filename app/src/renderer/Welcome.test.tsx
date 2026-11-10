import type { ReactElement } from "react";
import { expect, test, vi } from "vitest";

// Welcome's photo that can't be read hides and leaves the words. No DOM here, so Welcome runs as a function with its
// state kept in a slot, as React keeps it between renders.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) hooks.slots[index] = initial;
      return [hooks.slots[index], (next: unknown) => { hooks.slots[index] = next; }];
    },
  };
});
const { Welcome } = await import("./Onboarding");
type Node = ReactElement<{ className?: string; children?: unknown; onError?: () => void }>;
const render = () => { hooks.cursor = 0; return Welcome({ start: () => {} }) as Node; };

test("a photo that can't be read hides; the words stay", () => {
  const [copy, photo] = render().props.children as [Node, Node];
  expect(copy.props.className).toBe("ob-welcome-copy");
  expect(photo.props.className).toBe("ob-welcome-photo");
  (photo.props.children as Node).props.onError!();
  const [after, gone] = render().props.children as [Node, unknown];
  expect(after.props.className).toBe("ob-welcome-copy");
  expect(gone).toBe(false);
});
