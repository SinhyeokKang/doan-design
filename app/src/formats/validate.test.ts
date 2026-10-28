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
} from "./validate";

type Validate = (value: unknown) => boolean;

const fixtureDirectory = (name: string, validity: string) => new URL(`../../../schema/fixtures/${name}/${validity}/`, import.meta.url);
const readJson = (url: URL): unknown => JSON.parse(readFileSync(url, "utf8"));

// app-socket v1 (active) and v2 (onboarding) share fixture directories; the v2- prefix picks the protocol.
const isV2 = (file: string) => file.startsWith("v2-");
const fixtureFiles = (name: string, validity: string, select: (file: string) => boolean) =>
  readdirSync(fixtureDirectory(name, validity)).filter((file) => file.endsWith(".json") && select(file)).sort();

const groups: { name: string; label?: string; validate: Validate; select?: (file: string) => boolean }[] = [
  { name: "comment-event", validate: validateCommentEvent },
  { name: "config", validate: validateConfig },
  { name: "cli-envelope", validate: validateEnvelope },
  { name: "runtime", validate: validateRuntimeFile },
  { name: "sessions", validate: validateSessionRecord },
  { name: "app-socket/request", validate: validateSocketRequest, select: (file) => !isV2(file) },
  { name: "app-socket/response", validate: validateSocketResponse, select: (file) => !isV2(file) },
  { name: "app-socket/selection", validate: validateSelection },
  { name: "app-socket/request", label: "app-socket v2/request", validate: validateOnboardingRequest, select: isV2 },
  { name: "app-socket/response", label: "app-socket v2/response", validate: validateOnboardingResponse, select: isV2 },
];

for (const { name, label, validate, select = () => true } of groups) {
  describe(label ?? name, () => {
    for (const validity of ["valid", "invalid"]) {
      const files = fixtureFiles(name, validity, select);
      test(`${validity} fixtures exist`, () => expect(files.length).toBeGreaterThan(0));
      for (const file of files) {
        test(`${validity}/${file}`, () => {
          expect(validate(readJson(new URL(file, fixtureDirectory(name, validity))))).toBe(validity === "valid");
        });
      }
    }
  });
}

describe("app-socket v1 and v2 stay apart", () => {
  const pairs: { kind: string; v1: Validate; v2: Validate }[] = [
    { kind: "request", v1: validateSocketRequest, v2: validateOnboardingRequest },
    { kind: "response", v1: validateSocketResponse, v2: validateOnboardingResponse },
  ];
  for (const { kind, v1, v2 } of pairs) {
    const name = `app-socket/${kind}`;
    for (const file of fixtureFiles(name, "valid", (file) => !isV2(file))) {
      test(`v1 ${kind} ${file} is not v2`, () => expect(v2(readJson(new URL(file, fixtureDirectory(name, "valid"))))).toBe(false));
    }
    for (const file of fixtureFiles(name, "valid", isV2)) {
      test(`v2 ${kind} ${file} is not v1`, () => expect(v1(readJson(new URL(file, fixtureDirectory(name, "valid"))))).toBe(false));
    }
  }
});

interface MappingCase {
  name: string;
  op: string;
  reply: { v: number };
  expect: { ok: boolean; exit: number; isError: boolean; code?: string };
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
      expect(expected.isError).toBe(!expected.ok);
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
