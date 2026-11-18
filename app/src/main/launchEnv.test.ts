import { describe, expect, test } from "vitest";
import { LAUNCHD_PATH, launchEnv, restoreLaunchdCaCerts } from "./launchEnv";
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
// With the enableNodeOptionsEnvironmentVariable fuse off, Electron removes NODE_EXTRA_CA_CERTS before the app starts.
describe("NODE_EXTRA_CA_CERTS from launchd", () => {
  test("takes the launchctl setenv value, the same for a Dock or terminal launch", () => {
    const asked: string[] = [];
    const getenv = (name: string) => { asked.push(name); return "/etc/corp-ca.pem\n"; };
    for (const env of [{ ...DOCK } as Record<string, string | undefined>, { ...TERMINAL, NODE_EXTRA_CA_CERTS: "/terminal/ca.pem" }]) {
      restoreLaunchdCaCerts(env, getenv);
      expect(env.NODE_EXTRA_CA_CERTS).toBe("/etc/corp-ca.pem");
      expect(launchEnv(env).NODE_EXTRA_CA_CERTS).toBe("/etc/corp-ca.pem");
    }
    expect(asked).toEqual(["NODE_EXTRA_CA_CERTS", "NODE_EXTRA_CA_CERTS"]);
  });
  test("leaves no value when launchd has none or cannot be read", () => {
    for (const getenv of [() => "", () => "\n", () => { throw new Error("launchctl failed"); }]) {
      const env: Record<string, string | undefined> = { ...TERMINAL, NODE_EXTRA_CA_CERTS: "/terminal/ca.pem" };
      restoreLaunchdCaCerts(env, getenv);
      expect(env).not.toHaveProperty("NODE_EXTRA_CA_CERTS");
    }
  });
  test("other proxy, CA and locale keys are not read from launchd", () => {
    const env: Record<string, string | undefined> = { ...TERMINAL, ...NETWORK_LOCALE };
    restoreLaunchdCaCerts(env, () => "/etc/corp-ca.pem\n");
    expect(env).toEqual({ ...TERMINAL, ...NETWORK_LOCALE, NODE_EXTRA_CA_CERTS: "/etc/corp-ca.pem" });
  });
});
