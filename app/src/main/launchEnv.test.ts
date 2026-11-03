import { expect, test } from "vitest";
import { LAUNCHD_PATH, launchEnv } from "./launchEnv";
import { DOCK, TERMINAL } from "./launchEnv.fixture";

test("a terminal-launched app keeps exactly what a Dock launch gives it", () => {
  expect(launchEnv(TERMINAL)).toEqual(DOCK);
  expect(launchEnv(DOCK)).toEqual(DOCK);
});
test("PATH is launchd's default even when the launch had none", () => {
  expect(launchEnv({ HOME: "/Users/ada" })).toEqual({ HOME: "/Users/ada", PATH: LAUNCHD_PATH });
});
