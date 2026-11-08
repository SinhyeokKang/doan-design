import { expect, test } from "vitest";
import { holdHeaderNoDrag } from "./headerNoDrag";

// Agent usage and Restart to Update each open a popover under the same header. Each one open makes the header
// no-drag inline (POSTMORTEM 2026-11-06); the header drags again only when the last one closes.
function header() {
  const declared = new Map<string, string>();
  const style = { setProperty: (name: string, value: string) => { declared.set(name, value); }, removeProperty: (name: string) => { declared.delete(name); } };
  return { bar: { style } as unknown as HTMLElement, region: () => declared.get("-webkit-app-region") ?? "" };
}

test("A then B closed: the header stays no-drag until the last popover closes", () => {
  const { bar, region } = header();
  const a = holdHeaderNoDrag(bar, {}), b = holdHeaderNoDrag(bar, {});
  expect(region()).toBe("no-drag");
  a();
  expect(region()).toBe("no-drag");
  b();
  expect(region()).toBe("");
});

test("B then A closed: the same", () => {
  const { bar, region } = header();
  const a = holdHeaderNoDrag(bar, {}), b = holdHeaderNoDrag(bar, {});
  b();
  expect(region()).toBe("no-drag");
  a();
  expect(region()).toBe("");
});

test("one popover opened twice counts once, and releasing twice takes nothing from another", () => {
  const { bar, region } = header();
  const owner = {};
  const first = holdHeaderNoDrag(bar, owner), second = holdHeaderNoDrag(bar, owner);
  const other = holdHeaderNoDrag(bar, {});
  first();
  second();
  expect(region()).toBe("no-drag");
  other();
  expect(region()).toBe("");
  const again = holdHeaderNoDrag(bar, owner);
  again();
  expect(region()).toBe("");
});

// Every screen mounts its own header (App.tsx), so a popover open in one never holds another's.
test("each header counts its own popovers", () => {
  const one = header(), two = header();
  const a = holdHeaderNoDrag(one.bar, {}), b = holdHeaderNoDrag(two.bar, {});
  a();
  expect(one.region()).toBe("");
  expect(two.region()).toBe("no-drag");
  b();
  expect(two.region()).toBe("");
});
