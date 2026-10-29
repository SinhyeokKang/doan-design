import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { validateEnvelope } from "../formats/validate";
import { DESIGN_SKILL_REFUSED, designSkillGetRequest, interpretGet, interpretList } from "./designSkills";
import type { CliRun } from "./folderState";

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`../../../schema/fixtures/cli-envelope/design-skill/${name}`, import.meta.url), "utf8"));

interface Cases {
  version: string;
  list: { file: string };
  get: { file: string; id: string };
  rejected: { file: string; kind: string; ids: string[] }[];
  exit: { usage_error: number };
}
const cases = fixture("cases.json") as Cases;
const LIST = fixture(cases.list.file) as { v: 1; ok: true; result: { version: string; presets: Record<string, unknown>[] } };
const GET = fixture(cases.get.file) as { v: 1; ok: true; result: { version: string; preset: { id: string }; body: string; sources: unknown[] } };

const run = (stdout: unknown, overrides: Partial<CliRun> = {}): CliRun =>
  ({ exitCode: 0, timedOut: false, stdout: typeof stdout === "string" ? stdout : JSON.stringify(stdout), stderr: "", ...overrides });
const withResult = (envelope: { result: object }, result: object) => ({ ...envelope, result: { ...envelope.result, ...result } });
const cliError = (reason: string) => ({ v: 1, ok: false, error: { code: "cli_error", reason, message: expect.any(String), nextSteps: [] } });

describe("shared design-skill fixtures", () => {
  test("every listed fixture is a cli-envelope v1", () => {
    for (const file of [cases.list.file, cases.get.file, ...cases.rejected.map(entry => entry.file)]) expect(validateEnvelope(fixture(file)), file).toBe(true);
  });

  test("a list row carries exactly id, title, description and scope, and no body or sources", () => {
    expect(Object.keys(LIST.result).sort()).toEqual(["presets", "version"]);
    expect(LIST.result.version).toBe(cases.version);
    // The catalog grows in parallel batches; only the shape is fixed.
    expect(LIST.result.presets.length).toBeGreaterThan(0);
    for (const row of LIST.result.presets) {
      expect(Object.keys(row).sort()).toEqual(["description", "id", "scope", "title"]);
      for (const value of Object.values(row)) expect(typeof value).toBe("string");
    }
  });

  test("a single preset carries version, the list row, a complete body and its sources", () => {
    expect(Object.keys(GET.result).sort()).toEqual(["body", "preset", "sources", "version"]);
    expect(GET.result.preset.id).toBe(cases.get.id);
    expect(LIST.result.presets).toContainEqual(GET.result.preset);
    expect(GET.result.body.endsWith(`\n[doan:design-skill] end of preset ${cases.get.id} v${cases.version}\n`)).toBe(true);
    expect(GET.result.body).not.toContain("[doan:skill] end of guide");
    expect(GET.result.sources.length).toBeGreaterThan(0);
    for (const source of GET.result.sources) expect(Object.keys(source as object).sort()).toEqual(["commit", "path", "repository"]);
  });

  test("the list passes through unchanged, in catalog order", () => {
    expect(interpretList(run(LIST))).toEqual(LIST);
  });

  test("the single preset passes through unchanged", () => {
    expect(interpretGet(run(GET), cases.get.id)).toEqual(GET);
  });

  for (const { file, kind, ids } of cases.rejected) {
    test.each(ids)(`a ${kind} id (%j) keeps the CLI's usage_error and nextSteps`, id => {
      const envelope = fixture(file);
      expect(interpretGet(run(envelope, { exitCode: cases.exit.usage_error }), id)).toEqual(envelope);
    });
  }
});

describe("interpretList", () => {
  test("a list usage_error (a CLI without the command) stays the CLI's failure", () => {
    const unsupported = { v: 1, ok: false, error: { code: "usage_error", message: "unknown command \"design-skill\"", nextSteps: ["Run `doan help`."] } };
    expect(interpretList(run(unsupported, { exitCode: 2 }))).toEqual(unsupported);
  });

  test("a CLI failure keeps its own code, message and nextSteps", () => {
    const internal = { v: 1, ok: false, error: { code: "internal_error", message: "embedded catalog is invalid", nextSteps: [] } };
    expect(interpretList(run(internal, { exitCode: 1 }))).toEqual(internal);
  });

  test("an empty catalog is a success the CLI reported, not a failure turned empty", () => {
    const empty = withResult(LIST, { presets: [] });
    expect(interpretList(run(empty))).toEqual(empty);
  });

  test("keeps only the four list fields of each row", () => {
    const [first] = LIST.result.presets;
    const extra = withResult(LIST, { presets: [{ ...first, body: "full text", sources: [] }] });
    expect(interpretList(run(extra))).toEqual(withResult(LIST, { presets: [first] }));
  });

  test("a CLI that cannot start is unavailable", () => {
    expect(interpretList(run("", { exitCode: null, spawnError: "spawn /bundled/doan ENOENT" }))).toEqual(cliError("unavailable"));
  });

  test("a CLI the runner killed is a timeout, even with partial output", () => {
    expect(interpretList(run(JSON.stringify(LIST).slice(0, 40), { exitCode: null, timedOut: true }))).toEqual(cliError("timeout"));
  });

  test.each([
    ["not JSON", "doan dev\n", 0],
    ["empty output", "", 0],
    ["a JSON value that is not an envelope", "[]", 0],
    ["an unknown envelope version", { ...LIST, v: 2 }, 0],
    ["a success without a version", { v: 1, ok: true, result: { presets: LIST.result.presets } }, 0],
    ["presets that are not a list", withResult(LIST, { presets: {} }), 0],
    ["a row without a title", withResult(LIST, { presets: [{ id: "clarify", description: "d", scope: "s" }] }), 0],
    ["a row with a non-string field", withResult(LIST, { presets: [{ id: "clarify", title: 1, description: "d", scope: "s" }] }), 0],
    ["a failure with exit code 0", { v: 1, ok: false, error: { code: "usage_error", message: "m", nextSteps: [] } }, 0],
    ["a CLI failure that uses an app-only code", { v: 1, ok: false, error: { code: "request_refused", message: "m", nextSteps: [] } }, 2],
    ["a CLI failure that uses the app's cli_error", { v: 1, ok: false, error: { code: "cli_error", message: "m", nextSteps: [] } }, 1],
  ])("%s is an invalid response", (_name, stdout, exitCode) => {
    expect(interpretList(run(stdout, { exitCode }))).toEqual(cliError("invalid_response"));
  });

  test("an unknown envelope version is an invalid response whatever the exit code", () => {
    expect(interpretList(run({ v: 2, ok: false, error: { code: "usage_error" } }, { exitCode: 2 }))).toEqual(cliError("invalid_response"));
  });

  test("a success with a failing exit code is an invalid response", () => {
    expect(interpretList(run(LIST, { exitCode: 1 }))).toEqual(cliError("invalid_response"));
  });

  test.each([
    ["exit code 1", { exitCode: 1 }],
    ["a signal", { exitCode: null }],
  ])("an abnormal exit (%s) without a valid envelope has failed", (_name, overrides) => {
    expect(interpretList(run("panic: boom", { ...overrides, stderr: "panic: boom\ngoroutine 1" }))).toEqual(cliError("failed"));
  });

  test("never decides the CLI is old from stderr", () => {
    const reply = interpretList(run("", { exitCode: 2, stderr: "unknown command \"design-skill\"" }));
    expect(reply).toEqual(cliError("failed"));
  });
});

describe("interpretGet", () => {
  const id = cases.get.id;

  test.each([
    ["a body without the completeness marker", withResult(GET, { body: GET.result.body.replace(/\[doan:design-skill\][^\n]*\n$/, "") })],
    ["a truncated body", withResult(GET, { body: GET.result.body.slice(0, 200) })],
    ["a marker for another id", withResult(GET, { body: GET.result.body.replace(`end of preset ${id} `, "end of preset context ") })],
    ["a marker for another version", withResult(GET, { version: "9.9.9" })],
    ["a marker without its final newline", withResult(GET, { body: GET.result.body.slice(0, -1) })],
    ["another preset than the one asked for", withResult(GET, { preset: { ...GET.result.preset, id: "context" } })],
    ["a list result", LIST],
    ["sources that are not a list", withResult(GET, { sources: {} })],
    ["a source without a commit", withResult(GET, { sources: [{ repository: "r", path: "p" }] })],
    ["a body that is not text", withResult(GET, { body: 1 })],
  ])("%s is an invalid response", (_name, stdout) => {
    expect(interpretGet(run(stdout), id)).toEqual(cliError("invalid_response"));
  });

  test("result.version is provenance: a version other than the app's is accepted", () => {
    const other = withResult(GET, { version: "0.1.0", body: GET.result.body.replace(/ v[^ \n]+\n$/, " v0.1.0\n") });
    expect(interpretGet(run(other), id)).toEqual(other);
  });

  test("keeps only the result fields the contract defines", () => {
    const extra = withResult(GET, { preset: { ...GET.result.preset, hidden: true }, sources: GET.result.sources.map(source => ({ ...source as object, note: "x" })), more: 1 });
    expect(interpretGet(run(extra), id)).toEqual(GET);
  });

  test.each([
    ["unavailable", { exitCode: null, spawnError: "spawn E2BIG" }],
    ["timeout", { exitCode: null, timedOut: true }],
    ["failed", { exitCode: 2, stdout: "" }],
  ])("a run that ends without a result reports %s", (reason, overrides) => {
    expect(interpretGet(run("", overrides), id)).toEqual(cliError(reason));
  });
});

describe("designSkillGetRequest", () => {
  test("takes one string id", () => {
    expect(designSkillGetRequest({ id: "clarify" })).toBe("clarify");
    // The CLI judges the id; the app does not pre-empt its usage_error.
    expect(designSkillGetRequest({ id: "" })).toBe("");
    expect(designSkillGetRequest({ id: "../clarify" })).toBe("../clarify");
  });

  test.each([undefined, null, "clarify", 1, [], {}, { id: 1 }, { id: ["clarify"] }, { id: "clarify", args: ["--repo"] }])("refuses %j", value => {
    expect(designSkillGetRequest(value)).toBeNull();
  });
});

test("the refusal is an app failure in the CLI envelope", () => {
  expect(DESIGN_SKILL_REFUSED).toEqual({ v: 1, ok: false, error: { code: "request_refused", message: expect.any(String), nextSteps: [] } });
});
