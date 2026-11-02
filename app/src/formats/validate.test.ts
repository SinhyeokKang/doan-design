import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import appSocketV2Schema from "../../../schema/app-socket.v2.schema.json";
import {
  validateCommentEvent,
  validateConfig,
  validateEnvelope,
  validateOnboardingRequest,
  validateOnboardingResponse,
  validateRuntimeFile,
  validateSessionRecord,
  validateSelection,
  validateSocketRequest,
  validateSocketResponse,
  validateWorkRequest,
  validateWorkResponse,
} from "./validate";

type Validate = (value: unknown) => boolean;

const fixtureDirectory = (name: string, validity: string) => new URL(`../../../schema/fixtures/${name}/${validity}/`, import.meta.url);
const readJson = (url: URL): unknown => JSON.parse(readFileSync(url, "utf8"));

const fixtureFiles = (name: string, validity: string) =>
  readdirSync(fixtureDirectory(name, validity)).filter((file) => file.endsWith(".json")).sort();

const groups: { name: string; validate: Validate }[] = [
  { name: "comment-event", validate: validateCommentEvent },
  { name: "config", validate: validateConfig },
  { name: "cli-envelope", validate: validateEnvelope },
  { name: "runtime", validate: validateRuntimeFile },
  { name: "sessions", validate: validateSessionRecord },
  { name: "app-socket/request", validate: validateSocketRequest },
  { name: "app-socket/response", validate: validateSocketResponse },
  { name: "app-socket/selection", validate: validateSelection },
  { name: "app-socket-v2/request", validate: validateOnboardingRequest },
  { name: "app-socket-v2/response", validate: validateOnboardingResponse },
  { name: "app-socket-v3/request", validate: validateWorkRequest },
  { name: "app-socket-v3/response", validate: validateWorkResponse },
];

for (const { name, validate } of groups) {
  describe(name, () => {
    for (const validity of ["valid", "invalid"]) {
      const files = fixtureFiles(name, validity);
      test(`${validity} fixtures exist`, () => expect(files.length).toBeGreaterThan(0));
      for (const file of files) {
        test(`${validity}/${file}`, () => {
          expect(validate(readJson(new URL(file, fixtureDirectory(name, validity))))).toBe(validity === "valid");
        });
      }
    }
  });
}

describe("app-socket v3 stays apart from v1 and v2", () => {
  const others: { kind: string; label: string; dir: string; validate: Validate }[] = [
    { kind: "request", label: "v1", dir: "app-socket/request", validate: validateSocketRequest },
    { kind: "request", label: "v2", dir: "app-socket-v2/request", validate: validateOnboardingRequest },
    { kind: "response", label: "v1", dir: "app-socket/response", validate: validateSocketResponse },
    { kind: "response", label: "v2", dir: "app-socket-v2/response", validate: validateOnboardingResponse },
  ];
  for (const { kind, label, dir, validate } of others) {
    const v3 = kind === "request" ? validateWorkRequest : validateWorkResponse;
    for (const file of fixtureFiles(dir, "valid")) {
      test(`${label} ${kind} ${file} is not v3`, () => expect(v3(readJson(new URL(file, fixtureDirectory(dir, "valid"))))).toBe(false));
    }
    for (const file of fixtureFiles(`app-socket-v3/${kind}`, "valid")) {
      test(`v3 ${kind} ${file} is not ${label}`, () => expect(validate(readJson(new URL(file, fixtureDirectory(`app-socket-v3/${kind}`, "valid"))))).toBe(false));
    }
  }
});

describe("app-socket v1 and v2 stay apart", () => {
  const pairs: { kind: string; v1: Validate; v2: Validate }[] = [
    { kind: "request", v1: validateSocketRequest, v2: validateOnboardingRequest },
    { kind: "response", v1: validateSocketResponse, v2: validateOnboardingResponse },
  ];
  for (const { kind, v1, v2 } of pairs) {
    for (const file of fixtureFiles(`app-socket/${kind}`, "valid")) {
      test(`v1 ${kind} ${file} is not v2`, () => expect(v2(readJson(new URL(file, fixtureDirectory(`app-socket/${kind}`, "valid"))))).toBe(false));
    }
    for (const file of fixtureFiles(`app-socket-v2/${kind}`, "valid")) {
      test(`v2 ${kind} ${file} is not v1`, () => expect(v1(readJson(new URL(file, fixtureDirectory(`app-socket-v2/${kind}`, "valid"))))).toBe(false));
    }
  }
});

interface MappingCase {
  name: string;
  op: string;
  reply: { v: number };
  expect: { ok: boolean; exit: number; code?: string };
}
interface Mapping {
  translate: Record<string, string>;
  exitCodes: Record<string, number>;
  cases: MappingCase[];
}

describe("onboarding CLI mapping", () => {
  const mapping = readJson(new URL("../../../schema/fixtures/cli-envelope/onboarding/mapping.json", import.meta.url)) as Mapping;

  test("every code a command can return has an exit code", () => {
    const socketCodes = appSocketV2Schema.$defs.errorCode.enum.map((code) => mapping.translate[code] ?? code);
    const operationCodes = appSocketV2Schema.$defs.operationErrorCode.enum;
    const cliCodes = ["internal_error", "usage_error", "app_not_running", "app_protocol_mismatch", "app_launch_failed", "cancelled"];
    expect(Object.keys(mapping.exitCodes).sort()).toEqual([...new Set([...socketCodes, ...operationCodes, ...cliCodes])].sort());
  });

  for (const { name, reply, expect: expected } of mapping.cases) {
    test(name, () => {
      expect(reply.v === 2 ? validateOnboardingResponse(reply) : validateSocketResponse(reply)).toBe(true);
      if (expected.ok) {
        expect(expected.exit).toBe(0);
        expect(validateEnvelope({ v: 1, ok: true, result: (reply as { result?: unknown }).result })).toBe(true);
      } else {
        expect(expected.code && mapping.exitCodes[expected.code]).toBe(expected.exit);
        expect(validateEnvelope({ v: 1, ok: false, error: { code: expected.code, message: "m", nextSteps: [] } })).toBe(true);
      }
    });
  }
});

describe("open-link cases", () => {
  type Cases = {
    build: { name: string; root: string; path: string; frame?: string; expected: string }[];
    refuse: { name: string; url: string }[];
  };
  const cases = readJson(new URL("../../../schema/fixtures/open-link/cases.json", import.meta.url)) as Cases;

  test("has build and refuse cases", () => {
    expect(cases.build.length).toBeGreaterThan(0);
    expect(cases.refuse.length).toBeGreaterThan(0);
  });

  // The reader side of the encoding rule in the file's description: URLSearchParams must decode each expected URL back to its input.
  for (const entry of cases.build) {
    test(`build ${entry.name} decodes to its input`, () => {
      const url = new URL(entry.expected);
      expect([url.protocol, url.host]).toEqual(["doan:", "open"]);
      expect([...url.searchParams.keys()]).toEqual(entry.frame === undefined ? ["root", "canvas"] : ["root", "canvas", "frame"]);
      expect(url.searchParams.get("root")).toBe(entry.root);
      expect(url.searchParams.get("canvas")).toBe(entry.path);
      expect(url.searchParams.get("frame") ?? undefined).toBe(entry.frame);
    });
  }
});
