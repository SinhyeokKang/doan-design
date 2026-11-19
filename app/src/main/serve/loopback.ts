import { BlockList, isIP } from "node:net";
import { hostname, networkInterfaces } from "node:os";
import type { Session } from "electron";

export type Lookup = (hostname: string) => Promise<readonly string[]>;

// This Mac's own addresses and name reach the same listeners as loopback when a service binds 0.0.0.0 or ::.
// Read on every check, because they change as networks come and go. Other hosts on the local network stay reachable.
export interface OwnHost { addresses(): readonly string[]; name(): string }
const thisMac: OwnHost = {
  addresses: () => Object.values(networkInterfaces()).flatMap((entries) => entries?.map((entry) => entry.address) ?? []),
  name: hostname,
};

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

function ownAddress(ip: string, host: OwnHost): boolean {
  const family = isIP(ip);
  if (family === 0) return false;
  if (loopbackAddress(ip)) return true;
  // A BlockList so that an IPv4-mapped IPv6 literal matches the IPv4 interface address.
  const own = new BlockList();
  for (const address of host.addresses()) {
    const kind = isIP(address);
    if (kind !== 0) own.addAddress(address, kind === 4 ? "ipv4" : "ipv6");
  }
  return own.check(ip, family === 4 ? "ipv4" : "ipv6");
}

function ownName(name: string, host: OwnHost): boolean {
  const own = host.name().replace(/\.$/, "").toLowerCase();
  const base = own.endsWith(".local") ? own.slice(0, -".local".length) : own;
  return name === own || name === base || name === `${base}.local`;
}

const SCHEMES = new Set(["http:", "https:", "ws:", "wss:"]);

// The session's own resolver, so the answer comes from the same configuration (hosts file, per-domain resolvers) and
// cache the request will use. It runs in the network service, off the libuv threadpool the server's file reads use.
function sessionLookup(target: Pick<Session, "resolveHost">): Lookup {
  return async (name) => (await target.resolveHost(name)).endpoints.map((endpoint) => endpoint.address);
}

// A name is looked up because one that resolves to 127.0.0.1 reaches the same listeners as the literal. Name
// resolution is best-effort.
export async function reachesLoopback(raw: string, resolve: Lookup, host: OwnHost = thisMac): Promise<boolean> {
  if (!URL.canParse(raw)) return false;
  const url = new URL(raw);
  if (!SCHEMES.has(url.protocol) || url.hostname === "") return false;
  const name = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname.replace(/\.$/, "").toLowerCase();
  if (isIP(name) !== 0) return ownAddress(name, host);
  // Chromium answers `localhost` and `*.localhost` itself, without asking DNS.
  if (name === "localhost" || name.endsWith(".localhost") || ownName(name, host)) return true;
  try {
    return (await resolve(name)).some((ip) => ownAddress(ip, host));
  } catch {
    return false;
  }
}

// allowedHosts: `host:port` of the loopback origins the session may reach (the canvas server; the dev renderer).
export function guardLoopback(target: Pick<Session, "webRequest" | "resolveHost">, allowedHosts: () => readonly string[],
  resolve: Lookup = sessionLookup(target), host: OwnHost = thisMac): void {
  target.webRequest.onBeforeRequest((details, callback) => {
    void (async () => {
      try {
        const allowed = URL.canParse(details.url) && allowedHosts().includes(new URL(details.url).host);
        return { cancel: !allowed && await reachesLoopback(details.url, resolve, host) };
      } catch {
        return { cancel: true };
      }
    })().then(callback);
  });
}
