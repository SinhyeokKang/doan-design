import { expect, test } from "vitest";
import { headerShowButtons, NO_ROOM_FOR_INSPECTOR } from "./headerShowButtons";

test("both panels shown: no Show button and no divider", () => {
  expect(headerShowButtons({ inspectorOpen: true, conversationOpen: true, inspectorFits: true })).toEqual({ separator: false, buttons: [] });
});

test("one panel folded: the divider and that panel's Show button", () => {
  expect(headerShowButtons({ inspectorOpen: false, conversationOpen: true, inspectorFits: true })).toEqual({ separator: true, buttons: [{ target: "inspector" }] });
  expect(headerShowButtons({ inspectorOpen: true, conversationOpen: false, inspectorFits: true })).toEqual({ separator: true, buttons: [{ target: "conversation" }] });
});

test("both folded: one divider, Show inspector before Show conversation", () => {
  expect(headerShowButtons({ inspectorOpen: false, conversationOpen: false, inspectorFits: true })).toEqual({ separator: true, buttons: [{ target: "inspector" }, { target: "conversation" }] });
});

test("a window too narrow for the inspector shows Show inspector unavailable, whether its saved flag is open or not", () => {
  expect(NO_ROOM_FOR_INSPECTOR).toBe("No room for the inspector. Widen the window, or narrow or hide the conversation.");
  const disabled = { target: "inspector", disabled: NO_ROOM_FOR_INSPECTOR };
  expect(headerShowButtons({ inspectorOpen: true, conversationOpen: true, inspectorFits: false })).toEqual({ separator: true, buttons: [disabled] });
  expect(headerShowButtons({ inspectorOpen: false, conversationOpen: true, inspectorFits: false })).toEqual({ separator: true, buttons: [disabled] });
  expect(headerShowButtons({ inspectorOpen: false, conversationOpen: false, inspectorFits: false })).toEqual({ separator: true, buttons: [disabled, { target: "conversation" }] });
});
