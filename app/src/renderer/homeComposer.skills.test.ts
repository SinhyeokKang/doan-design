import { expect, test } from "vitest";
import { composeRequest, splitRequest, draftProblem, TEXT_LIMIT, slashQuery, slashKey, searchDrawer, presetListView, drawerSearchLabel, followDrawerHighlight, type PresetListReply, type PresetSummary } from "./homeComposer";

const preset: PresetSummary = { id: "audit", title: "Audit", description: "Review quality", scope: "screen", group: "review" };
const skills = [{ name: "deploy", description: "Ship release" }, { name: "audit", description: "Review dependencies" }];
const reply: PresetListReply = { v: 1, ok: true, result: { version: "1", presets: [preset] } };
const opts = { project: "p", suggested: [preset], query: "", tab: null, skills };

test.each([null, preset])("round trips preset and skill lines in order with %j", p => {
  const text = composeRequest("/deploy /audit /deploy", p, ["deploy", "audit", "deploy"], 0);
  expect(text).toBe((p ? "Use the Doan design preset `audit` (Audit).\n" : "") + "Use the project skill `deploy`.\nUse the project skill `audit`.\n\n/deploy /audit /deploy");
  expect(splitRequest(text, 0)).toEqual({ preset: p ? { id: p.id, title: p.title } : null, skills: ["deploy", "audit"], body: "/deploy /audit /deploy" });
});
test("round trips preset-only, plain and attachment-only requests", () => {
  for (const p of [null, preset]) for (const body of ["", "hello"]) {
    expect(splitRequest(composeRequest(body, p, [], 0), 0)).toEqual({ preset: p ? { id: p.id, title: p.title } : null, skills: [], body });
  }
  expect(splitRequest(composeRequest("", null, [], 1), 1)).toEqual({ preset: null, skills: [], body: "" });
});
test("counts skill headers in the send limit and validates their anchor markers", () => {
  const header = composeRequest("", preset, ["deploy"], 0).length + 2;
  const at = "a".repeat(TEXT_LIMIT - header);
  expect(draftProblem(at, preset, [], ["deploy"])).toBeNull();
  expect(draftProblem(at + "a", preset, [], ["deploy"])?.kind).toBe("overLimit");
  expect(draftProblem("hi", null, [], ["{{bad"])?.kind).toBe("anchorMarkers");
});
test("closes the slash search only after a leading skill word followed by whitespace", () => {
  const names = new Set(["deploy"]);
  expect(slashQuery("/design system", false, names)).toBe("design system");
  expect(slashQuery("/deploy ", false, names)).toBeNull();
  expect(slashQuery("/deploy로 staging", false, names)).toBeNull();
  expect(slashQuery("/deploy", false, names)).toBe("deploy");
  expect(slashQuery("/deploy ", false, new Set())).toBe("deploy ");
  expect(slashQuery("/deploy", true, names)).toBeNull();
  expect(slashQuery("", true, names)).toBeNull();
});
test("Enter sends an exact highlighted skill but picks a colliding preset", () => {
  const rows = searchDrawer([preset], skills, "audit");
  expect(slashKey("Enter", 0, rows.length, false, { query: "audit", row: rows[0] })).toEqual({ kind: "pick" });
  expect(slashKey("Enter", 1, rows.length, false, { query: "audit", row: rows[1] })).toBeNull();
  const deploy = searchDrawer([preset], skills, "deploy")[0];
  expect(slashKey("Enter", 0, 1, false, { query: "deploy", row: deploy })).toBeNull();
  expect(slashKey("Enter", 0, 1, false, { query: "dep", row: deploy })).toEqual({ kind: "pick" });
  expect(slashKey("Enter", 0, 1, true, { query: "dep", row: deploy })).toBeNull();
});
test("searches every token with existing scores, preset ties first, and exact names first", () => {
  expect(searchDrawer([preset], skills, "review").map(r => r.key)).toEqual(["preset:audit", "skill:audit"]);
  expect(searchDrawer([preset], skills, "audit").map(r => r.key)).toEqual(["preset:audit", "skill:audit"]);
  expect(searchDrawer([{ ...preset, description: "deploy" }], skills, "deploy").map(r => r.key)).toEqual(["skill:deploy", "preset:audit"]);
  expect(searchDrawer([preset], skills, "review dep").map(r => r.key)).toEqual(["skill:audit"]);
  expect(searchDrawer([], [{ name: "x", description: "predeploy" }, { name: "y", description: "a deploy" }, { name: "z", description: "deploy" }], "deploy").map(r => r.id)).toEqual(["z", "y", "x"]);
});
test("Project follows preset tabs and sorts skills by name with row icons", () => {
  const view = presetListView(reply, { ...opts, tab: "project" });
  if (view.kind !== "list") throw new Error("list");
  expect(view.tabs.map(t => t.key)).toEqual(["suggested", "review", "project"]);
  expect(view.tabs.at(-1)).toEqual({ key: "project", label: "Project", icon: "square-slash", selected: true });
  expect(view.sections[0]?.rows.map(r => [r.kind, r.id, r.icon, r.title])).toEqual([
    ["skill", "audit", "square-slash", "/audit"], ["skill", "deploy", "square-slash", "/deploy"],
  ]);
  expect(searchDrawer([preset], [], "")[0]).toMatchObject({ kind: "preset", icon: "scan-eye" });
});
test("vanished Project tab falls back to the first tab and keys distinguish colliding rows", () => {
  const view = presetListView(reply, { ...opts, skills: [], tab: "project" });
  if (view.kind !== "list") throw new Error("list");
  expect(view.tabs.filter(t => t.selected).map(t => t.key)).toEqual(["suggested"]);
  const before = searchDrawer([preset], skills, "audit"), after = searchDrawer([], skills, "audit");
  expect(followDrawerHighlight(before, after, 1)).toBe(0);
  expect(followDrawerHighlight(after, before, 0)).toBe(1);
  expect(followDrawerHighlight(before, after, 0)).toBe(0);
  expect(followDrawerHighlight(before, [], 1)).toBe(0);
});
test("shows skills below the independent loading, error, and older CLI notice", () => {
  const failures: (PresetListReply | undefined)[] = [undefined,
    { v: 1, ok: false, error: { code: "request_refused", message: "x", nextSteps: [] } },
    { v: 1, ok: false, error: { code: "usage_error", message: "x", nextSteps: [] } }];
  for (const failure of failures) {
    const notice = presetListView(failure, { ...opts, skills: [] });
    const view = presetListView(failure, opts);
    if (view.kind !== "list") throw new Error("list");
    expect(view.notice).toEqual(notice);
    expect(view.sections[0]?.title).toBe("Project");
    expect(view.sections[0]?.rows).toHaveLength(2);
  }
});
test("ungrouped CLI and slash list retain preset order then Project skills", () => {
  const old: PresetListReply = { v: 1, ok: true, result: { version: "1", presets: [{ id: "audit", title: "Audit", description: "", scope: "" }] } };
  const view = presetListView(old, opts);
  if (view.kind !== "list") throw new Error("list");
  expect(view.tabs).toEqual([]);
  expect(view.sections.map(s => s.title)).toEqual(["Suggested for p", "All presets", "Project"]);
  const slash = presetListView(reply, { ...opts, slash: true });
  if (slash.kind !== "list") throw new Error("list");
  expect(slash.tabs).toEqual([]);
  expect(slash.sections.flatMap(s => s.rows).map(r => r.kind)).toEqual(["preset", "skill", "skill"]);
});
test("uses confirmed search copy and omits absent result kinds", () => {
  expect(drawerSearchLabel([])).toBe("Search presets");
  expect(drawerSearchLabel(skills)).toBe("Search presets and skills");
  expect(presetListView(reply, { ...opts, query: "zz" })).toEqual({ kind: "empty", text: "No presets or skills match “zz”." });
  for (const [query, summary] of [["rev", "1 preset and 1 skill match rev"], ["dep", "2 skills match dep"], ["deploy", "1 skill matches deploy"]]) {
    const view = presetListView(reply, { ...opts, query: query! });
    if (view.kind !== "list") throw new Error("list");
    expect(view.summary).toBe(summary);
  }
});


test("restores combined requests without any fixed lines and keeps only the first preset", () => {
  const text = [composeRequest("/deploy a", preset, ["deploy"], 0), composeRequest("/audit b", { id: "polish", title: "Polish" }, ["audit", "deploy"], 0)].join("\n\n");
  expect(splitRequest(text, 0)).toEqual({ preset: { id: "audit", title: "Audit" }, skills: ["deploy", "audit"], body: "/deploy a\n\n/audit b" });
});

test.each([undefined, { v: 1, ok: false, error: { code: "internal_error", message: "x", nextSteps: [] } }] satisfies (PresetListReply | undefined)[])("keeps a preset notice while searching skills and showing the slash list: %j", failure => {
  const notice = presetListView(failure, { ...opts, skills: [] });
  if (failure) expect(notice).toMatchObject({ kind: "error", retry: true });
  else expect(notice).toEqual({ kind: "loading", text: "Loading presets" });
  const found = presetListView(failure, { ...opts, query: "dep" });
  expect(found).toMatchObject({ kind: "list", notice, summary: "2 skills match dep" });
  if (found.kind !== "list") throw new Error("list");
  expect(found.sections.flatMap(s => s.rows).map(r => r.key)).toEqual(["skill:deploy", "skill:audit"]);
  expect(presetListView(failure, { ...opts, query: "zz" })).toEqual({ kind: "list", tabs: [], sections: [], summary: null, notice, emptyText: "No presets or skills match “zz”." });
  for (const query of ["", "dep", "zz"]) {
    const slash = presetListView(failure, { ...opts, query, slash: true });
    expect(slash).toMatchObject({ kind: "list", tabs: [], notice });
    if (slash.kind !== "list") throw new Error("list");
    expect(slash.sections.flatMap(s => s.rows).map(r => r.kind)).toEqual(query === "zz" ? [] : ["skill", "skill"]);
    if (query === "dep") expect(slash.summary).toBe("2 skills match dep");
    if (query === "zz") expect(slash.emptyText).toBe("No presets or skills match “zz”.");
  }
});
