import { describe, expect, test } from "vitest";
import { parseShellProbe, findOnPath, isTranslocated, initArgs } from "./states";

describe("shell helpers", () => {
  test("reads exactly the four probe lines between nonce markers amid noise", () => {
    expect(parseShellProbe("welcome\nDOAN_PROBE_x_BEGIN\n/bin:/home/bin\n/custom/claude\n/custom/codex\nfalse\nDOAN_PROBE_x_END\nbye", "x")).toEqual({ ok: true, path: "/bin:/home/bin", claudeConfigDir: "/custom/claude", codexHome: "/custom/codex", promptSuggestion: "false" });
    expect(parseShellProbe("DOAN_PROBE_x_BEGIN\r\n/bin\r\n\r\n\r\n\r\nDOAN_PROBE_x_END\r\n", "x")).toEqual({ ok: true, path: "/bin" });
    for (const stdout of ["", "noise", "DOAN_PROBE_x_BEGIN\n/bin\n\n", "DOAN_PROBE_x_BEGIN\n\n\n\n\nDOAN_PROBE_x_END", "DOAN_PROBE_y_BEGIN\n/bin\n\n\n\nDOAN_PROBE_y_END",
      // The three-line output of a probe from before the fourth field.
      "DOAN_PROBE_x_BEGIN\n/bin\n\n\nDOAN_PROBE_x_END"]) expect(parseShellProbe(stdout, "x").ok).toBe(false);
  });
  test.each(["BEGIN", "END"])("rejects duplicate nonce %s markers", (marker) => {
    const stdout = `DOAN_PROBE_x_BEGIN\n/bin\n\n\n\nDOAN_PROBE_x_END\nDOAN_PROBE_x_${marker}`;
    expect(parseShellProbe(stdout, "x").ok).toBe(false);
  });
  test.each([0, 1, 2, 3])("rejects NUL in probe field %i", (index) => {
    const fields = ["/bin", "/custom/claude", "/custom/codex", "true"];
    fields[index] += "\0";
    expect(parseShellProbe(`DOAN_PROBE_x_BEGIN\n${fields.join("\n")}\nDOAN_PROBE_x_END`, "x").ok).toBe(false);
  });
  test("preserves symlink-parent PATH candidates for the executable check", () => {
    const checked: string[] = [];
    const candidate = "/probe/alias/../bin/codex";
    expect(findOnPath("/probe/alias/../bin/", "codex", (path) => {
      checked.push(path);
      return path === candidate;
    })).toBe(candidate);
    expect(checked).toEqual([candidate]);
    expect(findOnPath("///", "codex", () => true)).toBe("/codex");
  });
  test("ignores empty, relative and unexpanded PATH entries and honors order", () => {
    const checked: string[] = [];
    expect(findOnPath(":~/bin:relative:/first/:/second::", "codex", (path) => { checked.push(path); return path === "/second/codex"; })).toBe("/second/codex");
    expect(checked).toEqual(["/first/codex", "/second/codex"]);
    expect(findOnPath("", "claude", () => true)).toBeNull();
    expect(findOnPath("/bin", "../claude", () => true)).toBeNull();
  });
  test("detects the exact translocation segment", () => {
    expect(isTranslocated("/private/var/folders/a/AppTranslocation/id/d/doan.app")).toBe(true);
    expect(isTranslocated("/Applications/AppTranslocation-copy/doan.app")).toBe(false);
  });
});

test("builds init argv without shell interpolation", () => {
  expect(initArgs("/tmp/project", null)).toEqual(["init", "--json", "--repo", "/tmp/project"]);
  expect(initArgs("/tmp/project", "/tmp/project/a b.css")).toEqual(["init", "--json", "--repo", "/tmp/project", "--token-css", "/tmp/project/a b.css"]);
});
