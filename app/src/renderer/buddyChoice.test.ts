import { describe, expect, test, vi } from "vitest";
import type { PreferencesSnapshot } from "../main/preferences";
import { DEFAULT_PREFERENCES } from "../main/preferences";
import { buddyChoiceOff, buddyFailureText, buddyGate } from "./buddyChoice";

const snapshot = (notice: PreferencesSnapshot["notice"]): PreferencesSnapshot => ({ preferences: DEFAULT_PREFERENCES, notice });

describe("buddyFailureText", () => {
  test("names the pick and the buddy that stays, by name", () => {
    expect(buddyFailureText({ picked: "popo", kept: "doany" })).toBe("Couldn’t switch to Popo. Doany is still your buddy.");
    expect(buddyFailureText({ picked: "popo", kept: "dori" })).toBe("Couldn’t switch to Popo. Dori is still your buddy.");
  });
});

describe("buddyChoiceOff", () => {
  test("picking is off until the snapshot arrives and while a newer Doan's file applies defaults", () => {
    expect(buddyChoiceOff(null)).toBe(true);
    expect(buddyChoiceOff(snapshot("newer"))).toBe(true);
  });
  test("a readable or broken file lets a buddy be picked (a broken one is moved aside on save)", () => {
    expect(buddyChoiceOff(snapshot(null))).toBe(false);
    expect(buddyChoiceOff(snapshot("broken"))).toBe(false);
  });
});

describe("buddyGate", () => {
  const deferred = () => { let resolve!: (value: boolean) => void; const promise = new Promise<boolean>(r => { resolve = r; }); return { promise, resolve }; };

  test("leaving forward waits for the latest pick's save, then clears the notice and moves", async () => {
    const save = deferred();
    const move = vi.fn(), dismiss = vi.fn();
    const gate = buddyGate({ settled: () => save.promise, dismiss, move, generation: () => 1 });
    const left = gate.forward({ type: "continue" });
    await Promise.resolve();
    expect(move).not.toHaveBeenCalled();
    save.resolve(true);
    await left;
    expect(dismiss).toHaveBeenCalledOnce();
    expect(move).toHaveBeenCalledWith({ type: "continue" });
  });

  test("a failed save keeps the step and its notice", async () => {
    const move = vi.fn(), dismiss = vi.fn();
    await buddyGate({ settled: async () => false, dismiss, move, generation: () => 1 }).forward({ type: "step", to: "agent" });
    expect(move).not.toHaveBeenCalled();
    expect(dismiss).not.toHaveBeenCalled();
  });

  test("a second forward while one waits for the same save is dropped: a double Continue moves once", async () => {
    const save = deferred();
    const move = vi.fn(), dismiss = vi.fn();
    const gate = buddyGate({ settled: () => save.promise, dismiss, move, generation: () => 1 });
    const first = gate.forward({ type: "continue" });
    const second = gate.forward({ type: "step", to: "agent" });
    save.resolve(true);
    await Promise.all([first, second]);
    expect(move).toHaveBeenCalledOnce();
    expect(move).toHaveBeenCalledWith({ type: "continue" });
  });

  test("after a failed save the next forward waits and moves again", async () => {
    let result = false;
    const move = vi.fn(), dismiss = vi.fn();
    const gate = buddyGate({ settled: async () => result, dismiss, move, generation: () => 1 });
    await gate.forward({ type: "continue" });
    result = true;
    await gate.forward({ type: "continue" });
    expect(move).toHaveBeenCalledOnce();
  });

  test("a move whose scene changed while the save ran is dropped", async () => {
    const save = deferred();
    let generation = 1;
    const move = vi.fn(), dismiss = vi.fn();
    const left = buddyGate({ settled: () => save.promise, dismiss, move, generation: () => generation }).forward({ type: "continue" });
    generation = 2;
    save.resolve(true);
    await left;
    expect(move).not.toHaveBeenCalled();
  });

  test("Back leaves at once and clears the notice: only forward waits for the save", () => {
    const move = vi.fn(), dismiss = vi.fn();
    buddyGate({ settled: () => new Promise(() => {}), dismiss, move, generation: () => 1 }).back();
    expect(dismiss).toHaveBeenCalledOnce();
    expect(move).toHaveBeenCalledWith({ type: "back" });
  });
});
