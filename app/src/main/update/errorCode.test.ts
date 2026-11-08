import { describe, expect, test } from "vitest";
import { updateErrorCode, updateErrorSource } from "./errorCode";
import { UPDATE_ERROR_CODES } from "./types";

// The fixtures are the errors electron-updater 6.8.11 (builder-util-runtime 9.7.0) and Electron 45's Squirrel.Mac
// bridge actually raise: their message shapes and codes come from those packages' sources. The renderer only ever
// gets the code.

// builder-util-runtime `newError`: an Error with a string `code`.
const newError = (message: string, code: string) => Object.assign(new Error(message), { code });
// builder-util-runtime `createHttpError`: "<status> <statusMessage>", the request description as JSON, the headers.
function httpError(statusCode: number, statusMessage: string, description: string) {
  const error = Object.assign(new Error(`${statusCode} ${statusMessage}\n${JSON.stringify(description, null, "  ")}\nHeaders: {"content-type":"text/html; charset=utf-8"}`), { statusCode, code: `HTTP_ERROR_${statusCode}` });
  error.name = "HttpError";
  return error;
}
// A Node system error.
const systemError = (message: string, code: string) => Object.assign(new Error(message), { code, errno: -1, syscall: "write" });
// Electron's native autoUpdater error: Squirrel's NSError description with its numeric code and domain.
const squirrelError = (message: string, code: number, domain: string) => Object.assign(new Error(message), { code, domain });

const REPO = "https://github.com/SinhyeokKang/doan-design";
const stack = (error: Error) => `${error.name}: ${error.message}\n    at SimpleURLLoaderWrapper.<anonymous> (node:electron/js2c/browser_init:2:114720)`;
const NOT_FOUND_HINT = "\n\nPlease double check that your authentication token is correct. Due to security reasons, actual status maybe not reported, but 404.\n";
const YML_NOT_FOUND = httpError(404, "", `method: GET url: ${REPO}/releases/download/v0.1.1/latest-mac.yml${NOT_FOUND_HINT}`);
const LATEST_NOT_FOUND = httpError(404, "", `method: GET url: ${REPO}/releases/latest${NOT_FOUND_HINT}`);
const data = (path: string, body: string) => `method: GET url: ${REPO}${path}\n\n          Data:\n          ${body}\n          `;
// The releases feed is read first, outside any wrapper, so its HTTP errors arrive as they are.
const FEED_TOO_MANY = httpError(429, "Too Many Requests", data("/releases.atom", "<html>Too many requests</html>"));
// A stable copy then reads /releases/latest. GitHubProvider wraps that failure in ERR_UPDATER_LATEST_VERSION_NOT_FOUND,
// and the feed parser around the call wraps it again in ERR_UPDATER_INVALID_RELEASE_FEED with the whole feed appended.
const FEED_XML = '<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><entry><link rel="alternate" type="text/html" href="/SinhyeokKang/doan-design/releases/tag/v0.1.1"/><content type="html">&lt;p&gt;Fixes an update check that failed with net::ERR_INTERNET_DISCONNECTED, HttpError: 404 or HttpError: 429 and a rate limit message.&lt;/p&gt;</content></entry></feed>';
const latest = (cause: string) => newError(`Unable to find latest version on GitHub (${REPO}/releases/latest), please ensure a production release exists: ${cause}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND");
const inFeed = (inner: Error) => newError(`Cannot parse releases feed: ${stack(inner)},\nXML:\n${FEED_XML}`, "ERR_UPDATER_INVALID_RELEASE_FEED");

const FIXTURES: Record<string, [string, unknown][]> = {
  offline: [
    ["Electron net, no connection", new Error("net::ERR_INTERNET_DISCONNECTED")],
    ["Electron net, DNS", new Error("net::ERR_NAME_NOT_RESOLVED")],
    ["Electron net, network changed", new Error("net::ERR_NETWORK_CHANGED")],
    ["Electron net, reset", new Error("net::ERR_CONNECTION_RESET")],
    ["Electron net, timed out", new Error("net::ERR_CONNECTION_TIMED_OUT")],
    ["builder-util-runtime socket timeout", new Error("Request timed out")],
    ["Node DNS", systemError("getaddrinfo ENOTFOUND github.com", "ENOTFOUND")],
    ["/releases/latest unreachable, wrapped twice", inFeed(latest(stack(new Error("net::ERR_INTERNET_DISCONNECTED"))))],
  ],
  feedMissing: [
    ["latest-mac.yml missing from the release", newError(`Cannot find latest-mac.yml in the latest release artifacts (${REPO}/releases/download/v0.1.1/latest-mac.yml): ${stack(YML_NOT_FOUND)}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND")],
  ],
  rateLimited: [
    ["429 from /releases.atom", FEED_TOO_MANY],
    ["429 from /releases/latest, wrapped twice", inFeed(latest(stack(httpError(429, "Too Many Requests", data("/releases/latest", "Too many requests")))))],
    ["403 with a rate limit body from /releases.atom", httpError(403, "Forbidden", data("/releases.atom", "rate limit exceeded"))],
  ],
  signatureMismatch: [
    ["Squirrel's code signature check", squirrelError("Code signature at URL file:///Users/you/Library/Caches/design.doan.app.ShipIt/update.Xy12/Doan.app/ did not pass validation: code failed to satisfy specified code requirement(s)", -1, "SQRLCodeSignatureErrorDomain")],
  ],
  checksumMismatch: [
    ["sha512 of the zip", newError("sha512 checksum mismatch, expected 3oSCVLm1d9jKgbYzD2Xt9pQK0Jv/+3m1rP/2wq==, got Zq9mvFh0tP1gD3eFgM+S8pYbXz5aHq==", "ERR_CHECKSUM_MISMATCH")],
  ],
  diskFull: [
    ["writing the download", systemError("ENOSPC: no space left on device, write", "ENOSPC")],
  ],
  installFailed: [
    ["ShipIt could not replace the app", squirrelError("Failed to copy bundle file:///Applications/Doan.app/ to directory file:///Applications/.Doan.app.sqrl/", -1, "SQRLInstallerErrorDomain")],
    ["the administrator prompt was cancelled", squirrelError("The operation couldn’t be completed. (OSStatus error -60006.)", -60006, "NSOSStatusErrorDomain")],
    ["a read-only volume", squirrelError("Cannot update while running on a read-only volume. The application is on a read-only volume. Please move the application and try again. If you're on macOS Sierra or later, you'll need to move the application out of the Downloads directory. See https://github.com/Squirrel/Squirrel.Mac/issues/182 for more information.", 8, "SQRLUpdaterErrorDomain")],
    ["quit and install without a staged update", new Error("No update available, can't quit and install")],
  ],
  // The feedMissing line says the release lacks update information, so a missing release, an outage or a page in
  // place of JSON is other: the copy must not assert a cause the code does not know.
  other: [
    ["no stable release: /releases/latest is 404, wrapped twice", inFeed(latest(stack(LATEST_NOT_FOUND)))],
    ["no release at all: the feed has no entry", newError("No published versions on GitHub", "ERR_XML_MISSED_ELEMENT")],
    ["no release for this prerelease channel", newError("No published versions on GitHub", "ERR_UPDATER_NO_PUBLISHED_VERSIONS")],
    ["no zip in the update info", newError('ZIP file not provided: [{"url":"Doan-0.1.1-arm64.dmg"}]', "ERR_UPDATER_ZIP_FILE_NOT_FOUND")],
    ["empty update info", newError(`Cannot parse update info from latest-mac.yml in the latest release artifacts (${REPO}/releases/download/v0.1.1/latest-mac.yml): rawData: null`, "ERR_UPDATER_INVALID_UPDATE_INFO")],
    ["a server error from /releases.atom", httpError(502, "Bad Gateway", data("/releases.atom", "<html>Bad gateway</html>"))],
    ["a server error from /releases/latest, wrapped twice", inFeed(latest(stack(httpError(502, "Bad Gateway", data("/releases/latest", "<html>Bad gateway</html>")))))],
    ["a page in place of /releases/latest, wrapped twice", inFeed(latest(`SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`))],
    // Release notes in the appended feed name errors too; only the message before the feed counts.
    ["a feed that does not parse, whose notes name other errors", newError(`Cannot parse releases feed: Error: Unexpected close tag,\nXML:\n${FEED_XML}`, "ERR_UPDATER_INVALID_RELEASE_FEED")],
    ["a 403 that is not the rate limit", httpError(403, "Forbidden", data("/releases.atom", "denied"))],
    ["Squirrel's other failures", squirrelError("Update check failed. The server sent an invalid response. Try again later.", 3, "SQRLUpdaterErrorDomain")],
    ["a thrown string", "boom"],
    ["nothing", undefined],
    ["null", null],
    ["a plain object", { message: 42 }],
  ],
};

describe("updateErrorCode", () => {
  test("the code list is the one the renderer may receive", () => {
    expect(UPDATE_ERROR_CODES).toEqual(["offline", "feedMissing", "rateLimited", "signatureMismatch", "checksumMismatch", "diskFull", "installFailed", "other"]);
    expect(Object.keys(FIXTURES).sort()).toEqual([...UPDATE_ERROR_CODES].sort());
  });

  for (const [code, cases] of Object.entries(FIXTURES)) {
    test.each(cases)(`${code}: %s`, (_, error) => {
      expect(updateErrorCode(error)).toBe(code);
    });
  }
});

// Electron's autoUpdater adds Squirrel's NSError domain; electron-updater's own errors have none.
describe("updateErrorSource", () => {
  test("an error with a domain is native, anything else js", () => {
    expect(updateErrorSource(squirrelError("Code signature at URL file:///x did not pass validation", -1, "SQRLCodeSignatureErrorDomain"))).toBe("native");
    expect(updateErrorSource(squirrelError("The operation couldn’t be completed. (OSStatus error -60006.)", -60006, "NSOSStatusErrorDomain"))).toBe("native");
    for (const error of [new Error("net::ERR_INTERNET_DISCONNECTED"), newError("sha512 checksum mismatch", "ERR_CHECKSUM_MISMATCH"), systemError("ENOSPC: no space left on device, write", "ENOSPC"), "boom", null, undefined, { domain: 3 }]) {
      expect(updateErrorSource(error)).toBe("js");
    }
  });
});
