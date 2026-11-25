import { execFileSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getCACertificates, setDefaultCACertificates } from "node:tls";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { LAUNCHD_PATH, launchEnv, restoreLaunchdCaCerts, trustExtraCaCerts } from "./launchEnv";
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

// The fuse also stops Node from loading NODE_EXTRA_CA_CERTS for main's own requests, so main adds the file itself.
describe("main's own TLS trusts the NODE_EXTRA_CA_CERTS file", () => {
  const defaults = getCACertificates("default");
  // setDefaultCACertificates re-encodes what it stores, so certificates are compared by fingerprint.
  const trusted = () => new Set(getCACertificates("default").map(pem => new X509Certificate(pem).fingerprint256));
  const fingerprint = (path: string) => new X509Certificate(readFileSync(path)).fingerprint256;
  const original = new Set(defaults.map(pem => new X509Certificate(pem).fingerprint256));
  let dir = "", ca = "", server: Server, url = "";
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "doan-ca-"));
    // Extensions, digest and curve encoding are spelled out: LibreSSL (macOS's /usr/bin/openssl) defaults differ from
    // OpenSSL 3's in ways Node refuses (no CA:TRUE on `req -x509`, SHA-1 signatures, explicit EC parameters).
    const openssl = (...args: string[]) => execFileSync("openssl", args, { stdio: "ignore" });
    const key = ["-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256", "-pkeyopt", "ec_param_enc:named_curve", "-nodes", "-sha256"];
    for (const name of ["corp", "other"]) {
      openssl("req", "-x509", ...key, "-days", "1", "-subj", `/CN=Doan test ${name} CA`, "-addext", "basicConstraints=critical,CA:TRUE",
        "-addext", "keyUsage=critical,keyCertSign", "-keyout", join(dir, `${name}.key`), "-out", join(dir, `${name}.pem`));
    }
    openssl("req", "-new", ...key, "-subj", "/CN=127.0.0.1", "-keyout", join(dir, "server.key"), "-out", join(dir, "server.csr"));
    writeFileSync(join(dir, "server.ext"), "basicConstraints=critical,CA:FALSE\nsubjectAltName=IP:127.0.0.1\n");
    openssl("x509", "-req", "-in", join(dir, "server.csr"), "-CA", join(dir, "corp.pem"), "-CAkey", join(dir, "corp.key"), "-set_serial", "1",
      "-sha256", "-days", "1", "-extfile", join(dir, "server.ext"), "-out", join(dir, "server.pem"));
    ca = join(dir, "bundle.pem");
    writeFileSync(ca, readFileSync(join(dir, "other.pem"), "utf8") + readFileSync(join(dir, "corp.pem"), "utf8"));
    server = createServer({ key: readFileSync(join(dir, "server.key")), cert: readFileSync(join(dir, "server.pem")) }, (_request, response) => response.end("ok"));
    await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    url = `https://127.0.0.1:${address.port}/`;
  });
  afterEach(() => { setDefaultCACertificates(defaults); vi.restoreAllMocks(); });
  afterAll(async () => { await new Promise(done => server.close(done)); rmSync(dir, { recursive: true, force: true }); });

  test("adds every certificate in the file to the defaults, so a request to a server it signed succeeds", async () => {
    await expect(fetch(url)).rejects.toThrow();
    trustExtraCaCerts(ca, path => readFileSync(path, "utf8"));
    expect(trusted()).toEqual(new Set([...original, fingerprint(join(dir, "other.pem")), fingerprint(join(dir, "corp.pem"))]));
    expect(await (await fetch(url)).text()).toBe("ok");
  });
  test("keeps the defaults when there is no file, or it cannot be read or parsed", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    trustExtraCaCerts(undefined, () => { throw new Error("not read"); });
    expect(warn).not.toHaveBeenCalled();
    for (const read of [() => { throw new Error("ENOENT"); }, () => "-----BEGIN CERTIFICATE-----\nnot base64\n-----END CERTIFICATE-----\n"]) {
      trustExtraCaCerts("/etc/corp-ca.pem", read);
      expect(trusted()).toEqual(original);
    }
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
