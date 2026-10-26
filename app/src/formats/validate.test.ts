import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  validateCommentEvent,
  validateConfig,
  validateEnvelope,
  validateRuntimeFile,
  validateSessionRecord,
  validateSelection,
  validateSocketRequest,
  validateSocketResponse,
} from "./validate";

const groups = [
  { name: "comment-event", validate: validateCommentEvent },
  { name: "config", validate: validateConfig },
  { name: "cli-envelope", validate: validateEnvelope },
  { name: "runtime", validate: validateRuntimeFile },
  { name: "sessions", validate: validateSessionRecord },
  { name: "app-socket/request", validate: validateSocketRequest },
  { name: "app-socket/response", validate: validateSocketResponse },
  { name: "app-socket/selection", validate: validateSelection },
];

for (const { name, validate } of groups) {
  describe(name, () => {
    for (const validity of ["valid", "invalid"]) {
      const directory = new URL(`../../../schema/fixtures/${name}/${validity}/`, import.meta.url);
      const files = readdirSync(directory).filter((file) => file.endsWith(".json")).sort();
      test(`${validity} fixtures exist`, () => expect(files.length).toBeGreaterThan(0));
      for (const file of files) {
        test(`${validity}/${file}`, () => {
          const value: unknown = JSON.parse(readFileSync(new URL(file, directory), "utf8"));
          expect(validate(value)).toBe(validity === "valid");
        });
      }
    }
  });
}
