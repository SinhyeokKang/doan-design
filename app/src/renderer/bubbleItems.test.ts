import { describe, expect, it } from "vitest";
import { bubbleAction, bubbleItems } from "./bubbleItems";
import { NO_ROOM_FOR_INSPECTOR } from "./headerShowButtons";

describe("selection bubble items", () => {
  it.each([true, false])("orders the actions around the size when playable is %s", play => {
    const prefix = play ? [{ kind: "play" }, { kind: "size" }] : [{ kind: "size" }];
    expect(bubbleItems({ play, inspectorOpen: false, inspectorFits: true })).toEqual([...prefix, { kind: "add" }, { kind: "inspect" }]);
    expect(bubbleItems({ play, inspectorOpen: true, inspectorFits: true })).toEqual([...prefix, { kind: "add" }]);
  });

  it.each([true, false])("gives the header's reason when the inspector cannot fit, saved open %s", inspectorOpen => {
    expect(bubbleItems({ play: false, inspectorOpen, inspectorFits: false }).at(-1)).toEqual({ kind: "inspect", disabled: NO_ROOM_FOR_INSPECTOR });
  });
});

describe("bubbleAction", () => {
  it.each(["play", "add", "inspect"])("recognizes %s through its nested icon", action => {
    const icon = { closest: (selector: string) => selector === "[data-bubble-action]" ? { getAttribute: () => action } : null };
    expect(bubbleAction(icon as unknown as Element)).toBe(action);
  });

  it("ignores the label, unrecognized actions and an absent target", () => {
    expect(bubbleAction({ closest: () => null } as unknown as Element)).toBeNull();
    expect(bubbleAction({ closest: () => ({ getAttribute: () => "unknown" }) } as unknown as Element)).toBeNull();
    expect(bubbleAction(null)).toBeNull();
  });
});
