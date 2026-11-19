import { describe, expect, test, vi } from "vitest";
import { guardLoopback, loopbackAddress, reachesLoopback, type Lookup, type OwnHost } from "./loopback";

const publicLookup: Lookup = () => Promise.resolve(["142.250.1.1"]);
const noLookup: Lookup = () => Promise.reject(new Error("lookup must not run"));
const mac: OwnHost = { addresses: () => ["127.0.0.1", "::1", "fe80::1", "192.168.0.10", "2001:db8::5"], name: () => "My-Mac.local" };
const bareMac: OwnHost = { addresses: () => [], name: () => "My-Mac" };

describe("loopbackAddress", () => {
  test("covers 127.0.0.0/8, 0.0.0.0/8, ::1, :: and IPv4-mapped loopback", () => {
    for (const ip of ["127.0.0.1", "127.9.9.9", "0.0.0.0", "::1", "::", "0:0:0:0:0:0:0:1", "::ffff:127.0.0.1", "::ffff:7f00:1"]) {
      expect(loopbackAddress(ip)).toBe(true);
    }
  });

  test("leaves other addresses alone", () => {
    for (const ip of ["8.8.8.8", "128.0.0.1", "192.168.0.10", "2001:db8::1", "::ffff:808:808", "not-an-ip"]) {
      expect(loopbackAddress(ip)).toBe(false);
    }
  });
});

describe("reachesLoopback", () => {
  test("loopback literals and localhost names, without a lookup", async () => {
    for (const url of [
      "http://127.0.0.1:5000/x", "http://127.9.9.9/", "http://localhost:3000/", "http://LOCALHOST./", "http://app.localhost/",
      "http://[::1]:8080/", "http://[::ffff:127.0.0.1]/", "http://0.0.0.0:80/", "http://2130706433/", "ws://127.0.0.1:9/socket", "wss://localhost/",
    ]) {
      expect(await reachesLoopback(url, noLookup)).toBe(true);
    }
  });

  test("a name that resolves to a loopback address", async () => {
    expect(await reachesLoopback("http://loop.example.test:8000/", () => Promise.resolve(["10.0.0.1", "127.0.0.1"]))).toBe(true);
    expect(await reachesLoopback("https://v6.example.test/", () => Promise.resolve(["::1"]))).toBe(true);
  });

  test("external addresses and names stay reachable", async () => {
    expect(await reachesLoopback("https://fonts.googleapis.com/css2?family=Inter", publicLookup)).toBe(false);
    expect(await reachesLoopback("https://8.8.8.8/", noLookup)).toBe(false);
    expect(await reachesLoopback("http://[2001:db8::1]/", noLookup)).toBe(false);
  });

  test("a name that does not resolve is left to the browser", async () => {
    expect(await reachesLoopback("https://nowhere.invalid/", () => Promise.reject(new Error("ENOTFOUND")))).toBe(false);
  });

  test("this Mac's own interface addresses, IPv4 and IPv6", async () => {
    for (const url of ["http://192.168.0.10:3000/", "http://[2001:db8::5]:8080/", "http://[::ffff:192.168.0.10]/", "ws://192.168.0.10:9/"]) {
      expect(await reachesLoopback(url, noLookup, mac)).toBe(true);
    }
  });

  test("this Mac's own .local name, with or without the suffix in its host name", async () => {
    for (const url of ["http://my-mac.local:8000/", "http://My-Mac.local./", "http://MY-MAC.LOCAL/"]) {
      expect(await reachesLoopback(url, noLookup, mac)).toBe(true);
    }
    expect(await reachesLoopback("http://my-mac.local:8000/", noLookup, bareMac)).toBe(true);
  });

  test("a name that resolves to one of this Mac's addresses", async () => {
    expect(await reachesLoopback("http://printer-alias.test/", () => Promise.resolve(["192.168.0.10"]), mac)).toBe(true);
  });

  test("other hosts on the local network stay reachable", async () => {
    expect(await reachesLoopback("http://192.168.0.11:3000/", noLookup, mac)).toBe(false);
    expect(await reachesLoopback("http://[2001:db8::6]/", noLookup, mac)).toBe(false);
    expect(await reachesLoopback("http://other-mac.local/", () => Promise.resolve(["192.168.0.11"]), mac)).toBe(false);
  });

  test("other schemes are never looked up", async () => {
    for (const url of ["file:///etc/hosts", "data:text/plain,x", "blob:null/1234", "devtools://devtools/x", "chrome-extension://abc/x", "not a url"]) {
      expect(await reachesLoopback(url, noLookup)).toBe(false);
    }
  });
});

describe("guardLoopback", () => {
  type Listener = (details: { url: string }, callback: (response: { cancel: boolean }) => void) => void;
  function install(allowed: () => readonly string[], lookup: Lookup = publicLookup) {
    let listener: Listener | undefined;
    const target = { webRequest: { onBeforeRequest: vi.fn((l: Listener) => { listener = l; }) } };
    guardLoopback(target as never, allowed, lookup);
    return (url: string) => new Promise<{ cancel: boolean }>((resolve) => listener?.({ url }, resolve));
  }

  test("cancels requests to other loopback ports and addresses", async () => {
    const request = install(() => ["127.0.0.1:4100"]);
    expect(await request("http://127.0.0.1:5000/")).toEqual({ cancel: true });
    expect(await request("http://localhost:4100/t/x/k/a.html")).toEqual({ cancel: true });
    expect(await request("http://[::1]:4100/")).toEqual({ cancel: true });
    expect(await request("ws://127.0.0.1:9229/")).toEqual({ cancel: true });
  });

  test("keeps the canvas's own server and external URLs", async () => {
    const request = install(() => ["127.0.0.1:4100"]);
    expect(await request("http://127.0.0.1:4100/t/tok/key/.doan/canvases/a.html")).toEqual({ cancel: false });
    expect(await request("https://fonts.googleapis.com/css2?family=Inter")).toEqual({ cancel: false });
    expect(await request("file:///app/out/renderer/index.html")).toEqual({ cancel: false });
  });

  test("reads the allowed hosts at request time", async () => {
    let hosts: string[] = [];
    const request = install(() => hosts);
    expect(await request("http://127.0.0.1:4100/")).toEqual({ cancel: true });
    hosts = ["127.0.0.1:4100"];
    expect(await request("http://127.0.0.1:4100/")).toEqual({ cancel: false });
  });

  test("resolves names with the session's own resolver by default", async () => {
    let listener: Listener | undefined;
    const resolveHost = vi.fn((_host: string) => Promise.resolve({ endpoints: [{ address: "127.0.0.1", family: "ipv4" as const }] }));
    const target = { webRequest: { onBeforeRequest: vi.fn((l: Listener) => { listener = l; }) }, resolveHost };
    guardLoopback(target as never, () => []);
    const response = await new Promise<{ cancel: boolean }>((resolve) => listener?.({ url: "http://hosts-alias.test:8000/" }, resolve));
    expect(response).toEqual({ cancel: true });
    expect(resolveHost).toHaveBeenCalledWith("hosts-alias.test");
  });

  test("reads this Mac's addresses at request time", async () => {
    let addresses: string[] = [];
    let listener: Listener | undefined;
    const target = { webRequest: { onBeforeRequest: vi.fn((l: Listener) => { listener = l; }) } };
    guardLoopback(target as never, () => [], publicLookup, { addresses: () => addresses, name: () => "My-Mac.local" });
    const request = (url: string) => new Promise<{ cancel: boolean }>((resolve) => listener?.({ url }, resolve));
    expect(await request("http://10.0.0.7:3000/")).toEqual({ cancel: false });
    addresses = ["10.0.0.7"];
    expect(await request("http://10.0.0.7:3000/")).toEqual({ cancel: true });
  });

  test("a failing check cancels", async () => {
    const request = install(() => { throw new Error("no shell"); });
    expect(await request("http://127.0.0.1:4100/")).toEqual({ cancel: true });
  });
});
