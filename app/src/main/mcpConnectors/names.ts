import { PRESETS, type ConnectorServer } from "./presets";

const MAX_URL = 2048;
const MAX_SLUG = 16;
// `mcp__doan-<slug>__` leaves room for the tool name within the providers' tool-name limits (design '이름 규칙').
export const CONNECTOR_NAME = /^doan-[a-z0-9][a-z0-9-]{0,15}$/;

export type UrlRejection = "empty" | "too_long" | "invalid" | "not_https" | "credentials" | "fragment";
export type ConnectorUrlRead = { ok: true; url: string } | { ok: false; reason: UrlRejection };

// The normalized form is also the URL's own href, so what Doan compares, stores and hands a provider is one string:
// Codex derives its keychain key from the URL it registered, and a pending logout must rebuild the same key.
export function parseConnectorUrl(text: string): ConnectorUrlRead {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (trimmed.length > MAX_URL) return { ok: false, reason: "too_long" };
  // The URL parser drops tabs and newlines silently; refuse them instead of accepting a different URL.
  if (/[\u0000-\u001f\u007f]/.test(trimmed) || !URL.canParse(trimmed)) return { ok: false, reason: "invalid" };
  const url = new URL(trimmed);
  if (url.protocol !== "https:") return { ok: false, reason: "not_https" };
  // "user@" parses to a username; a bare "@" leaves both empty, so the raw text is checked too.
  if (url.username || url.password || /^https:\/\/[^/?#]*@/i.test(trimmed)) return { ok: false, reason: "credentials" };
  if (trimmed.includes("#")) return { ok: false, reason: "fragment" };
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, -1);
  return { ok: true, url: url.href };
}

// Whether a URL is in the stored form: one parseConnectorUrl can return. Normalizing is input-only and not
// idempotent (it drops one trailing slash per call), so stored URLs are checked, not normalized again.
export function storedConnectorUrl(url: string): boolean {
  return parseConnectorUrl(url).ok && new URL(url).href === url;
}

// The preset or URL server already registered at this normalized URL, if any.
export function connectorWithUrl(url: string, servers: readonly ConnectorServer[]): string | null {
  return [...PRESETS, ...servers].find(server => server.url === url)?.name ?? null;
}

function slug(text: string, max: number): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, max).replace(/-+$/, "");
}

// The name a new URL server registers under: its host as a slug, with -2, -3, ... when the slug is taken. Preset
// names are always taken. The suffix shortens the host part so the whole slug stays within 16 characters.
export function connectorName(url: string, existing: readonly string[]): string {
  const taken = new Set([...PRESETS.map(preset => preset.name), ...existing]);
  const host = new URL(url).hostname;
  const base = slug(host, MAX_SLUG) || "server";
  if (!taken.has(`doan-${base}`)) return `doan-${base}`;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const name = `doan-${slug(base, MAX_SLUG - suffix.length) || "server"}${suffix}`;
    if (!taken.has(name)) return name;
  }
}
