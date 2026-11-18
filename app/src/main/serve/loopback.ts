import { Resolver } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import type { Session } from "electron";

export type Lookup = (hostname: string) => Promise<readonly string[]>;

// Chromium's local-network gating does not cover requests from a document served from 127.0.0.1, so the session
// filters a canvas's requests to other loopback addresses itself. 0.0.0.0 and :: reach this Mac's own listeners on macOS.
const LOOPBACK = new BlockList();
LOOPBACK.addSubnet("127.0.0.0", 8, "ipv4");
LOOPBACK.addSubnet("0.0.0.0", 8, "ipv4");
LOOPBACK.addAddress("::1", "ipv6");
LOOPBACK.addAddress("::", "ipv6");

export function loopbackAddress(ip: string): boolean {
  const family = isIP(ip);
  return family !== 0 && LOOPBACK.check(ip, family === 4 ? "ipv4" : "ipv6");
}

const SCHEMES = new Set(["http:", "https:", "ws:", "wss:"]);

// c-ares, not getaddrinfo: `dns.lookup` holds a libuv worker for as long as a slow resolver takes, and four of them
// stall main's file system work, the canvas server's included. A bounded query on the network keeps that apart.
const resolver = new Resolver({ timeout: 2000, tries: 1 });
const systemLookup: Lookup = async (hostname) => {
  const answers = await Promise.allSettled([resolver.resolve4(hostname), resolver.resolve6(hostname)]);
  return answers.flatMap((answer) => answer.status === "fulfilled" ? answer.value : []);
};

// A name is looked up because one that resolves to 127.0.0.1 reaches the same listeners as the literal. Name
// resolution is best-effort.
export async function reachesLoopback(raw: string, resolve: Lookup = systemLookup): Promise<boolean> {
  if (!URL.canParse(raw)) return false;
  const url = new URL(raw);
  if (!SCHEMES.has(url.protocol) || url.hostname === "") return false;
  const host = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname.replace(/\.$/, "").toLowerCase();
  if (isIP(host) !== 0) return loopbackAddress(host);
  // Chromium answers `localhost` and `*.localhost` itself, without asking DNS.
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  try {
    return (await resolve(host)).some(loopbackAddress);
  } catch {
    return false;
  }
}

// allowedHosts: `host:port` of the loopback origins the session may reach (the canvas server; the dev renderer).
export function guardLoopback(target: Pick<Session, "webRequest">, allowedHosts: () => readonly string[], resolve: Lookup = systemLookup): void {
  target.webRequest.onBeforeRequest((details, callback) => {
    void (async () => {
      try {
        const allowed = URL.canParse(details.url) && allowedHosts().includes(new URL(details.url).host);
        return { cancel: !allowed && await reachesLoopback(details.url, resolve) };
      } catch {
        return { cancel: true };
      }
    })().then(callback);
  });
}
