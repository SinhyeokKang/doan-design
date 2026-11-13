import { describe, expect, test } from "vitest";
import { senderAllowed } from "../senderAllowed";
import { PROTOTYPE_CHANNELS, PROTOTYPE_LOAD_TIMEOUT_MS, PROTOTYPE_WINDOW_REQUESTS } from "./ipc";

describe("prototype channels", () => {
  test("names every channel once under prototype:", () => {
    expect(PROTOTYPE_CHANNELS).toEqual({
      play: "prototype:play",
      read: "prototype:read",
      changed: "prototype:changed",
      result: "prototype:result",
      frames: "prototype:frames",
      reload: "prototype:reload",
      back: "prototype:back",
      forward: "prototype:forward",
      choose: "prototype:choose",
      close: "prototype:close",
      mode: "prototype:mode",
      closed: "prototype:closed",
      snapshot: "prototype:snapshot",
    });
    expect(PROTOTYPE_WINDOW_REQUESTS).toEqual(["prototype:read", "prototype:result", "prototype:frames", "prototype:reload", "prototype:back", "prototype:forward", "prototype:choose", "prototype:close", "prototype:mode"]);
  });

  test("a run that does not answer in 10 s is an init failure", () => {
    expect(PROTOTYPE_LOAD_TIMEOUT_MS).toBe(10_000);
  });
});

describe("sender guard", () => {
  test("only the main window may ask to play", () => {
    expect(senderAllowed(PROTOTYPE_CHANNELS.play, "main")).toBe(true);
    for (const kind of ["prototype", "settings", undefined, null, ""]) expect(senderAllowed(PROTOTYPE_CHANNELS.play, kind)).toBe(false);
  });

  test("only the prototype window may drive its own run", () => {
    for (const channel of PROTOTYPE_WINDOW_REQUESTS) {
      expect(senderAllowed(channel, "prototype"), channel).toBe(true);
      expect(senderAllowed(channel, "main"), channel).toBe(false);
      for (const kind of ["settings", undefined, null, "", "Prototype"]) expect(senderAllowed(channel, kind), channel).toBe(false);
    }
  });

  test("the events main sends are never requests", () => {
    for (const kind of ["main", "prototype"]) for (const channel of [PROTOTYPE_CHANNELS.changed, PROTOTYPE_CHANNELS.closed, PROTOTYPE_CHANNELS.snapshot, "prototype:", "prototype:open", "prototype:evil"]) expect(senderAllowed(channel, kind)).toBe(false);
  });

  test("the prototype window gets none of the main window's channels", () => {
    for (const channel of ["selection:set", "ui-state:get", "ui-state:save", "preferences:read", "attachments:add-pasted", "read-state:showing", "folders:get", "shell:openLink", "canvas:export", "toString", "__proto__"]) {
      expect(senderAllowed(channel, "prototype"), channel).toBe(false);
    }
  });
});
