import { getCACertificates, setDefaultCACertificates } from "node:tls";

// What a Dock (LaunchServices) launch gives the app. Other launches pass the terminal's whole environment, which must
// reach neither the login-shell probe nor an agent; an allowlist, since any terminal can add keys.
const LAUNCHD_KEYS = new Set(["HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "SSH_AUTH_SOCK", "COMMAND_MODE",
  "XPC_FLAGS", "XPC_SERVICE_NAME", "OSLogRateLimit", "__CF_USER_TEXT_ENCODING", "__CFBundleIdentifier"]);
// `launchctl setenv` reaches Dock launches too, and that is where a corporate proxy or CA, or a locale, is set for GUI
// apps. These name no terminal session, so they stay when present; TERM and TERM_PROGRAM describe the terminal and do not.
const NETWORK_LOCALE_KEYS = new Set(["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy",
  "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE", "LANG", "TZ"]);
const kept = (name: string) => LAUNCHD_KEYS.has(name) || NETWORK_LOCALE_KEYS.has(name) || name.startsWith("LC_");
// launchd's default PATH; a terminal's PATH would otherwise change what the login shell builds on top of it.
export const LAUNCHD_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";

export function launchEnv(inherited: Record<string, string | undefined>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(inherited)) if (kept(name) && value !== undefined) env[name] = value;
  return { ...env, PATH: LAUNCHD_PATH };
}

// The fuse being off, Electron removes NODE_EXTRA_CA_CERTS before Node reads it, so the value `launchctl setenv` gave
// GUI apps is read back from launchd; a terminal's value is replaced too, so every launch passes on the same CA.
export function restoreLaunchdCaCerts(env: Record<string, string | undefined>, getenv: (name: string) => string): void {
  let value = "";
  // Unreadable launchd: pass no CA rather than a terminal's, and say so, since agents' TLS errors would not.
  try { value = getenv("NODE_EXTRA_CA_CERTS").replace(/\n$/, ""); } catch (error) { console.warn("doan: could not read NODE_EXTRA_CA_CERTS from launchd", error); }
  if (value) env.NODE_EXTRA_CA_CERTS = value;
  else delete env.NODE_EXTRA_CA_CERTS;
}

// The same fuse stops Node loading NODE_EXTRA_CA_CERTS for main's own requests, so main adds launchd's file to its
// default CAs before any TLS connection. An unreadable or unparsable file leaves the defaults, as Node does.
export function trustExtraCaCerts(file: string | undefined, read: (path: string) => string): void {
  if (!file) return;
  try { setDefaultCACertificates([...getCACertificates("default"), read(file)]); }
  catch (error) { console.warn("doan: could not trust the CA certificates in NODE_EXTRA_CA_CERTS", error); }
}
