import { expect, it } from "vitest";
import { validAnchor } from "./prompt";

// agent-reply-chips T0 made Anchor.element.selector optional for reply chips. A person's anchor still needs it:
// the agent reads the selector from the sent message.
it("validAnchor still rejects a person's element anchor without a selector", () => {
  expect(validAnchor({ element: { doanId: "save" } })).toBe(false);
  expect(validAnchor({ frame: { id: "editor" }, element: { doanId: "save", tag: "button" } })).toBe(false);
  expect(validAnchor({ element: { doanId: "save", selector: '[data-doan-id="save"]' } })).toBe(true);
});
