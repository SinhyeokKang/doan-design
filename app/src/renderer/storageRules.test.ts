import { describe, expect, test } from "vitest";
import { keptLocal, storageSectionView, storedNote, switchNote } from "./storageRules";

// PRODUCT §5 item 0 'Doan files' and draft canvas local-doan-files frames settings-modes, settings-changes,
// settings-disabled.
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
    // Outside Git both stay open: Keep out of Git creates the repository after a confirmation, and the line says so
    // as information (no alert icon).
    expect(storageSectionView({ storage: "repo", storageReason: "not_git" }, null)).toEqual({ checked: "repo", disabled: { repo: false, local: false }, reason: { text: "not_git", tone: "info" }, guidance: false, createsRepository: true });
    // Unreadable metadata: the mode is unknown, so neither is chosen and the reason is a warning.
    expect(storageSectionView({ storage: "unknown", storageReason: "git_unreadable" }, null)).toEqual({ checked: null, disabled: { repo: true, local: true }, reason: { text: "git_unreadable", tone: "warning" }, guidance: false });
    expect(storageSectionView({ storage: "unknown" }, null)).toMatchObject({ checked: null, disabled: { repo: true, local: true }, reason: { text: "git_unreadable", tone: "warning" } });
    expect(storageSectionView({ storage: "repo", storageReason: "exclude_unwritable" }, null)).toEqual({ checked: "repo", disabled: { repo: true, local: true }, reason: { text: "exclude_unwritable", tone: "subtle" }, guidance: false });
    // Out of Git with an exclude Doan can no longer write: still out of Git, so the guidance stays (it always shows
    // out of Git).
    expect(storageSectionView({ storage: "local", storageReason: "exclude_unwritable" }, null)).toMatchObject({ checked: "local", disabled: { repo: true, local: true }, guidance: true });
  });
});

// Draft keep-out-git-init, frame project-settings: Doan creates no repository in the home folder or above it, so there
// Keep out of Git stays closed with its own reason, in the shipped disabled-reason style.
describe("the Doan files section outside Git", () => {
  test("in the home folder or above it, Keep out of Git stays closed and says Doan makes no repository there", () => {
    expect(storageSectionView({ storage: "repo", storageReason: "not_git" }, null, true)).toEqual({ checked: "repo", disabled: { repo: false, local: true }, reason: { text: "home", tone: "subtle" }, guidance: false });
  });

  test("only a folder outside Git asks before switching, and a write in flight closes both options", () => {
    expect(storageSectionView({ storage: "repo" }, null)).not.toHaveProperty("createsRepository");
    expect(storageSectionView({ storage: "repo", storageReason: "not_git" }, "local")).toMatchObject({ checked: "local", disabled: { repo: true, local: true }, reason: { text: "not_git" } });
  });

  test("Saved says the repository was created before the shipped .gitattributes line", () => {
    expect(switchNote("repo", "local", true)).toBe("createdRepository");
    expect(switchNote("repo", "local", false)).toBe("attributesStay");
    expect(switchNote("local", "repo", true)).toBe("nowTracked");
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
