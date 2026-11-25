import type { UpdateErrorCode, UpdateErrorSource } from "./types";

// GitHubProvider wraps release errors, so offline and rate-limit tests read the message before other codes, cut at
// "\nXML:\n": the appended feed holds release notes anyone can write.

// Electron's net errors and Node's system errors for a connection that never got an answer.
const OFFLINE_MESSAGE = /net::ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|NAME_RESOLUTION_FAILED|NETWORK_CHANGED|NETWORK_IO_SUSPENDED|ADDRESS_UNREACHABLE|CONNECTION_(REFUSED|RESET|CLOSED|ABORTED|FAILED|TIMED_OUT)|TIMED_OUT|PROXY_CONNECTION_FAILED)\b|^Request timed out$/m;
const OFFLINE_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENETUNREACH", "EHOSTUNREACH"]);
// ShipIt replacing the app, the administrator prompt it may raise, and Squirrel refusing a read-only volume.
const INSTALL_DOMAINS = new Set(["SQRLInstallerErrorDomain", "NSOSStatusErrorDomain"]);
const SQRL_UPDATER_READ_ONLY_VOLUME = 8;

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

// Electron's autoUpdater gives Squirrel's errors the NSError domain; electron-updater's own errors have none.
export function updateErrorSource(error: unknown): UpdateErrorSource {
  return record(error) && typeof error.domain === "string" ? "native" : "js";
}

export function updateErrorCode(error: unknown): UpdateErrorCode {
  if (!record(error)) return "other";
  const message = typeof error.message === "string" ? error.message.split("\nXML:\n", 1)[0]! : "";
  const code = error.code;
  const domain = typeof error.domain === "string" ? error.domain : null;

  if (OFFLINE_MESSAGE.test(message) || (typeof code === "string" && OFFLINE_CODES.has(code))) return "offline";
  if (error.statusCode === 429 || /HttpError: 429\b/.test(message) || ((error.statusCode === 403 || /HttpError: 403\b/.test(message)) && /rate limit/i.test(message))) return "rateLimited";
  if (domain === "SQRLCodeSignatureErrorDomain" || code === "ERR_UPDATER_INVALID_SIGNATURE") return "signatureMismatch";
  if (code === "ERR_CHECKSUM_MISMATCH") return "checksumMismatch";
  if (code === "ENOSPC") return "diskFull";
  // Only the release's latest-mac.yml answering 404 (or empty): the release exists without update information. No
  // release at all, or a release the copy cannot read, would make that line false, so those stay other.
  if (code === "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND") return "feedMissing";
  if ((domain !== null && INSTALL_DOMAINS.has(domain)) || (domain === "SQRLUpdaterErrorDomain" && code === SQRL_UPDATER_READ_ONLY_VOLUME)) return "installFailed";
  // Electron's own message when quitAndInstall finds nothing staged.
  if (message === "No update available, can't quit and install") return "installFailed";
  return "other";
}
