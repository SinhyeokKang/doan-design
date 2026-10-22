import { expect, test } from "vitest";
import { inspectorStateText } from "./inspector";

test("names each inspector state in text, with inheritance and hover state", () => {
  expect(inspectorStateText({ property: "color", value: "#4f46e5", state: "token", token: "--brand" })).toBe("--brand");
  expect(inspectorStateText({ property: "color", value: "red", state: "hardcoded" })).toBe("Hardcoded");
  expect(inspectorStateText({ property: "color", value: "red", state: "unknown" })).toBe("Unknown source");
  expect(inspectorStateText({ property: "color", value: "red", state: "default" })).toBe("Default");
  expect(inspectorStateText({ property: "color", value: "red", state: "hardcoded", inheritedFrom: "body", hoverState: true })).toBe("Hardcoded · Inherited from body · Hover state");
});
