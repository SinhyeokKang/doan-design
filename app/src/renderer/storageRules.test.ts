import { describe, expect, test } from "vitest";
import { keptLocal, storageSectionView, storedNote, switchNote } from "./storageRules";

// local-doan-files design §3.2 and draft frames settings-modes, settings-changes, settings-disabled.
describe("the Doan files section", () => {
  test("is not drawn when doan reported no mode", () => {
    expect(storageSectionView({}, null)).toBeNull();
  });

  test("shows the mode on disk with both options open, and the guidance only out of Git", () => {
    expect(storageSectionView({ storage: "repo" }, null)).toEqual({ checked: "repo", disabled: { repo: false, local: false }, reason: null, guidance: false });
    expect(storageSectionView({ storage: "local" }, null)).toEqual({ checked: "local", disabled: { repo: false, local: false }, reason: null, guidance: true });
  });

  test("keeps the pressed option chosen while it is written, with both disabled and the guidance of the mode on disk", () => {
    expect(storageSectionView({ storage: "repo" }, "local")).toEqual({ checked: "local", disabled: { repo: true, local: true }, reason: null, guidance: false });
    expect(storageSectionView({ storage: "local" }, "repo")).toEqual({ checked: "repo", disabled: { repo: true, local: true }, reason: null, guidance: true });
  });

  test("closes only what cannot be chosen, one reason each", () => {
    // Outside Git, Include in Git is the mode and stays open.
    expect(storageSectionView({ storage: "repo", storageReason: "not_git" }, null)).toEqual({ checked: "repo", disabled: { repo: false, local: true }, reason: { text: "not_git", tone: "subtle" }, guidance: false });
    // Unreadable metadata: the mode is unknown, so neither is chosen and the reason is a warning.
    expect(storageSectionView({ storage: "unknown", storageReason: "git_unreadable" }, null)).toEqual({ checked: null, disabled: { repo: true, local: true }, reason: { text: "git_unreadable", tone: "warning" }, guidance: false });
    expect(storageSectionView({ storage: "unknown" }, null)).toMatchObject({ checked: null, disabled: { repo: true, local: true }, reason: { text: "git_unreadable", tone: "warning" } });
    expect(storageSectionView({ storage: "repo", storageReason: "exclude_unwritable" }, null)).toEqual({ checked: "repo", disabled: { repo: true, local: true }, reason: { text: "exclude_unwritable", tone: "subtle" }, guidance: false });
    // Out of Git with an exclude Doan can no longer write: still out of Git, so the guidance stays (spec decision 3).
    expect(storageSectionView({ storage: "local", storageReason: "exclude_unwritable" }, null)).toMatchObject({ checked: "local", disabled: { repo: true, local: true }, guidance: true });
  });
});

describe("the header's path line", () => {
  test("keeps the commit sentence in Git and for an older doan, says this Mac out of Git, and drops it when unknown", () => {
    expect(storedNote("repo")).toBe("commit");
    expect(storedNote(undefined)).toBe("commit");
    expect(storedNote("local")).toBe("thisMac");
    expect(storedNote("unknown")).toBe("plain");
  });
});

describe("the line beside Saved", () => {
  test("says what changed outside Doan, and nothing when the mode did not change", () => {
    expect(switchNote("repo", "local")).toBe("attributesStay");
    expect(switchNote("local", "repo")).toBe("nowTracked");
    expect(switchNote("repo", "repo")).toBeNull();
    expect(switchNote("local", "local")).toBeNull();
  });
});

describe("a setup plan of a project already kept out of Git", () => {
  test("is shown local with no exclude entry to add", () => {
    expect(keptLocal({ changes: [".doan/canvases/", ".doan/config.json"], storage: "local" })).toBe(true);
    expect(keptLocal({ changes: [".doan/canvases/", ".doan/config.json", ".git/info/exclude"], storage: "local" })).toBe(false);
    expect(keptLocal({ changes: [".doan/canvases/", ".doan/config.json", ".gitattributes"] })).toBe(false);
    expect(keptLocal({ changes: [], storage: "local" })).toBe(false);
  });
});
