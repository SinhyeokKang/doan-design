import { describe, expect, test } from "vitest";
import { initMessage, nextFocusIndex, tilde } from "./onboardingView";

const home = "/Users/alex";

describe("onboarding window", () => {
  test("Tab wraps inside the wizard", () => {
    expect(nextFocusIndex(3, 2, false, null)).toBe(0);
    expect(nextFocusIndex(3, 0, true, null)).toBe(2);
    expect(nextFocusIndex(3, 1, false, null)).toBeNull();
    expect(nextFocusIndex(0, -1, false, null)).toBeNull();
  });
  test("focus outside the wizard (body, after a control disabled itself) still enters at the first or last control", () => {
    expect(nextFocusIndex(3, -1, false, null)).toBe(0);
    expect(nextFocusIndex(3, -1, true, null)).toBe(2);
  });
  test("a focused element outside the list (a tabindex=-1 heading) moves in DOM order; only the ends wrap", () => {
    // Welcome: Doany, h1, Get started. The browser moves to Get started on Tab and Doany on Shift+Tab.
    expect(nextFocusIndex(2, -1, false, 1)).toBeNull();
    expect(nextFocusIndex(2, -1, true, 1)).toBeNull();
    // A heading before every control: Tab enters at the next control, Shift+Tab wraps to the last.
    expect(nextFocusIndex(1, -1, false, 0)).toBeNull();
    expect(nextFocusIndex(3, -1, true, 0)).toBe(2);
    // An element after every control: Tab wraps to the first, Shift+Tab goes back in DOM order.
    expect(nextFocusIndex(3, -1, false, 3)).toBe(0);
    expect(nextFocusIndex(3, -1, true, 3)).toBeNull();
  });
});

describe("project setup copy", () => {
  test("init results become one line of copy, or nothing on success", () => {
    expect(initMessage({ kind: "success" })).toBeNull();
    expect(initMessage({ kind: "error", message: "Token CSS must be a file inside the repository.", guidance: "Check the project and choose a CSS file inside it, then try again." })).toBe("Token CSS must be a file inside the repository. Check the project and choose a CSS file inside it, then try again.");
    expect(initMessage({ kind: "cliError", reason: "timed out after 10 s" })).toBe("doan CLI error: timed out after 10 s");
    expect(initMessage({ kind: "unavailable", message: "This project is no longer available for setup." })).toBe("This project is no longer available for setup.");
    expect(initMessage({ kind: "rerooted", root: "/a", message: "This folder is inside /a, which is already set up." })).toBe("This folder is inside /a, which is already set up.");
  });
});

describe("paths", () => {
  test("home is shortened to ~ only at a path boundary", () => {
    expect(tilde("/Users/alex/.local/bin/doan", home)).toBe("~/.local/bin/doan");
    expect(tilde("/Users/alex", home)).toBe("~");
    expect(tilde("/Users/alexander/x", home)).toBe("/Users/alexander/x");
    expect(tilde("/opt/x", home)).toBe("/opt/x");
  });
});
