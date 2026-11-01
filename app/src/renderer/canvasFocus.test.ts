import { describe, expect, it } from "vitest";
import { controlFocusLost, menuCloseFocus, menuCloseNow } from "./canvasFocus";

// buzz-canvas design §2 'Esc와 포커스': the decisions behind the header menus' and canvas controls' focus. Radix's own
// focus return and real focus movement are checked in the runtime probe (ARCHITECTURE §7 'Home tests without a DOM').
describe("menuCloseNow", () => {
  it("closes an open menu whose trigger turned disabled, without marking a canvas move", () => {
    expect(menuCloseNow({ open: true, enabled: false, canvasChanged: false })).toEqual({ close: true, moved: false });
  });

  it("closes an open menu when the canvas changes and marks the move", () => {
    expect(menuCloseNow({ open: true, enabled: true, canvasChanged: true })).toEqual({ close: true, moved: true });
    expect(menuCloseNow({ open: true, enabled: false, canvasChanged: true })).toEqual({ close: true, moved: true });
  });

  it("leaves an open, enabled menu on the same canvas alone", () => {
    expect(menuCloseNow({ open: true, enabled: true, canvasChanged: false })).toEqual({ close: false, moved: false });
  });

  it("does nothing for a closed menu", () => {
    expect(menuCloseNow({ open: false, enabled: false, canvasChanged: true })).toEqual({ close: false, moved: false });
  });
});

describe("menuCloseFocus", () => {
  it("lets Radix return focus to a usable trigger after an ordinary close", () => {
    expect(menuCloseFocus({ moved: false, triggerUsable: true, focusLost: true })).toBe("trigger");
  });

  it("never returns focus to the trigger after a canvas move; lost focus goes to the canvas region", () => {
    expect(menuCloseFocus({ moved: true, triggerUsable: true, focusLost: true })).toBe("fallback");
  });

  it("does not steal the focus a canvas move already placed", () => {
    expect(menuCloseFocus({ moved: true, triggerUsable: true, focusLost: false })).toBe("leave");
  });

  it("sends focus from a disabled trigger's menu to the canvas region", () => {
    expect(menuCloseFocus({ moved: false, triggerUsable: false, focusLost: true })).toBe("fallback");
  });
});

describe("controlFocusLost", () => {
  const control = (over: Partial<{ connected: boolean; disabled: boolean }> = {}) => ({ connected: true, disabled: false, ...over });

  it("moves focus when the focused control was removed and focus fell to the page", () => {
    expect(controlFocusLost({ last: control({ connected: false }), activeLost: true, activeIsLast: false, covered: false })).toBe(true);
  });

  it("moves focus when the focused control turned disabled", () => {
    expect(controlFocusLost({ last: control({ disabled: true }), activeLost: false, activeIsLast: true, covered: false })).toBe(true);
    expect(controlFocusLost({ last: control({ disabled: true }), activeLost: true, activeIsLast: false, covered: false })).toBe(true);
  });

  it("leaves focus that moved elsewhere", () => {
    expect(controlFocusLost({ last: control({ connected: false }), activeLost: false, activeIsLast: false, covered: false })).toBe(false);
  });

  it("leaves a page click that blurred a control which is still usable", () => {
    expect(controlFocusLost({ last: control(), activeLost: true, activeIsLast: false, covered: false })).toBe(false);
  });

  it("does nothing while the Overview covers the canvas page or no control was focused", () => {
    expect(controlFocusLost({ last: control({ connected: false }), activeLost: true, activeIsLast: false, covered: true })).toBe(false);
    expect(controlFocusLost({ last: null, activeLost: true, activeIsLast: false, covered: false })).toBe(false);
  });
});
