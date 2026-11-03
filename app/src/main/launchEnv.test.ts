import { expect, test } from "vitest";
import { LAUNCHD_PATH, launchEnv } from "./launchEnv";
import { DOCK, NETWORK_LOCALE, TERMINAL } from "./launchEnv.fixture";

test("a terminal-launched app keeps exactly what a Dock launch gives it", () => {
  expect(launchEnv(TERMINAL)).toEqual(DOCK);
  expect(launchEnv(DOCK)).toEqual(DOCK);
});
test("proxy, CA and locale keys stay, since launchctl setenv gives them to a Dock launch too", () => {
  expect(launchEnv({ ...TERMINAL, ...NETWORK_LOCALE })).toEqual({ ...DOCK, ...NETWORK_LOCALE });
});
test("PATH is launchd's default even when the launch had none", () => {
  expect(launchEnv({ HOME: "/Users/ada" })).toEqual({ HOME: "/Users/ada", PATH: LAUNCHD_PATH });
});
