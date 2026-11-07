import { describe, expect, test } from "vitest";
import { updateErrorCode } from "./errorCode";
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
const NOT_FOUND = httpError(404, "", `method: GET url: ${REPO}/releases/download/v0.1.1/latest-mac.yml\n\nPlease double check that your authentication token is correct. Due to security reasons, actual status maybe not reported, but 404.\n`);
const TOO_MANY = httpError(429, "Too Many Requests", `method: GET url: ${REPO}/releases.atom\n\n          Data:\n          <html>Too many requests</html>\n          `);
const stack = (error: Error) => `${error.name}: ${error.message}\n    at SimpleURLLoaderWrapper.<anonymous> (node:electron/js2c/browser_init:2:114720)`;

const FIXTURES: Record<string, [string, unknown][]> = {
  offline: [
    ["Electron net, no connection", new Error("net::ERR_INTERNET_DISCONNECTED")],
    ["Electron net, DNS", new Error("net::ERR_NAME_NOT_RESOLVED")],
    ["Electron net, network changed", new Error("net::ERR_NETWORK_CHANGED")],
    ["Electron net, reset", new Error("net::ERR_CONNECTION_RESET")],
    ["Electron net, timed out", new Error("net::ERR_CONNECTION_TIMED_OUT")],
    ["builder-util-runtime socket timeout", new Error("Request timed out")],
    ["Node DNS", systemError("getaddrinfo ENOTFOUND github.com", "ENOTFOUND")],
    // GitHubProvider wraps whatever failed while reading the latest release, network errors included.
    ["wrapped in latest version not found", newError(`Unable to find latest version on GitHub (${REPO}/releases/latest), please ensure a production release exists: ${stack(new Error("net::ERR_INTERNET_DISCONNECTED"))}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND")],
  ],
  feedMissing: [
    ["latest-mac.yml missing from the release", newError(`Cannot find latest-mac.yml in the latest release artifacts (${REPO}/releases/download/v0.1.1/latest-mac.yml): ${stack(NOT_FOUND)}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND")],
    ["no release at all", newError("No published versions on GitHub", "ERR_UPDATER_NO_PUBLISHED_VERSIONS")],
    ["no latest release", newError(`Unable to find latest version on GitHub (${REPO}/releases/latest), please ensure a production release exists: ${stack(NOT_FOUND)}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND")],
    ["no zip in the update info", newError('ZIP file not provided: [{"url":"Doan-0.1.1-arm64.dmg"}]', "ERR_UPDATER_ZIP_FILE_NOT_FOUND")],
    ["empty update info", newError(`Cannot parse update info from latest-mac.yml in the latest release artifacts (${REPO}/releases/download/v0.1.1/latest-mac.yml): rawData: null`, "ERR_UPDATER_INVALID_UPDATE_INFO")],
  ],
  rateLimited: [
    ["429 from the releases feed", TOO_MANY],
    ["429 wrapped in latest version not found", newError(`Unable to find latest version on GitHub (${REPO}/releases/latest), please ensure a production release exists: ${stack(TOO_MANY)}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND")],
    ["403 with GitHub's rate limit body", httpError(403, "Forbidden", `method: GET url: https://api.github.com/repos/SinhyeokKang/doan-design/releases/latest\n\n          Data:\n          {"message":"API rate limit exceeded for 203.0.113.7."}\n          `)],
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
  other: [
    ["a server error", httpError(502, "Bad Gateway", `method: GET url: ${REPO}/releases.atom`)],
    // Only a missing release (404) means the feed is missing; an outage or a page in place of JSON does not.
    ["a server error wrapped in latest version not found", newError(`Unable to find latest version on GitHub (${REPO}/releases/latest), please ensure a production release exists: ${stack(httpError(502, "Bad Gateway", `method: GET url: ${REPO}/releases/latest`))}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND")],
    ["a page in place of the latest release", newError(`Unable to find latest version on GitHub (${REPO}/releases/latest), please ensure a production release exists: SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND")],
    ["a feed GitHub answered with a page", newError("Cannot parse releases feed: Error: Unexpected close tag,\nXML:\n<html></html>", "ERR_UPDATER_INVALID_RELEASE_FEED")],
    ["a 403 that is not the rate limit", httpError(403, "Forbidden", `method: GET url: ${REPO}/releases.atom\n\n          Data:\n          denied\n          `)],
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
