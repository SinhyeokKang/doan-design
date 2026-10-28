import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { antigravityServer, AUTH_LINK_MARKER, BROWSER_HOOK, callbackAddress, signInLink } from "./antigravity";
import { AuthStorage } from "./storage";
import { fakeCipher } from "./fixtures/cipher";

const LINK = "https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=c&redirect_uri=http%3A%2F%2F127.0.0.1%3A64065%2F&scope=email&state=yhREG&code_challenge=x";
describe("Antigravity sign-in link", () => {
  it("accepts only a Google code request returning to a loopback port, from the hook marker or the server's own line", () => {
    expect(signInLink(`${AUTH_LINK_MARKER}${LINK}`)).toMatchObject({ url: LINK, state: "yhREG" });
    expect(signInLink(`Open the following link to authenticate the ACP server: ${LINK}\r`)?.redirect.port).toBe("64065");
    for (const line of [LINK, `${AUTH_LINK_MARKER}${LINK.replace("accounts.google.com", "evil.example")}`, `${AUTH_LINK_MARKER}${LINK.replace("127.0.0.1", "example.com")}`,
      `${AUTH_LINK_MARKER}${LINK.replace("64065", "80")}`, `${AUTH_LINK_MARKER}${LINK.replace("response_type=code", "response_type=token")}`, `${AUTH_LINK_MARKER}${LINK}&state=two`]) {
      expect(signInLink(line)).toBeNull();
    }
  });
  it("accepts a pasted address only for the same listener and state", () => {
    const link = signInLink(`${AUTH_LINK_MARKER}${LINK}`)!;
    expect(callbackAddress(link, " http://127.0.0.1:64065/?state=yhREG&code=4/0A&scope=email ")?.href).toBe("http://127.0.0.1:64065/?state=yhREG&code=4/0A&scope=email");
    expect(callbackAddress(link, "http://127.0.0.1:64065/?state=yhREG&error=access_denied")).not.toBeNull();
    for (const pasted of ["http://127.0.0.1:64066/?state=yhREG&code=x", "http://127.0.0.1:64065/other?state=yhREG&code=x", "http://127.0.0.1:64065/?state=other&code=x",
      "http://127.0.0.1:64065/?state=yhREG", "https://127.0.0.1:64065/?state=yhREG&code=x", "4/0Acode", "http://127.0.0.1:64065/?state=yhREG&state=yhREG&code=x"]) {
      expect(callbackAddress(link, pasted)).toBeNull();
    }
  });
});
describe("Antigravity server install", () => {
  it("refuses a download that does not match the pinned archive and leaves nothing installed", async () => {
    const root = mkdtempSync(join(tmpdir(), "doan-agy-"));
    try {
      const download = async () => new Blob(["not the archive"]).stream();
      await expect(antigravityServer(root, download)).rejects.toThrow("pinned hash");
      expect(readdirSync(root)).toEqual([]);
      expect(existsSync(join(root, "1.3.0"))).toBe(false);
      // A failed install is not cached: the next call downloads again.
      let calls = 0;
      await expect(antigravityServer(root, async () => { calls += 1; throw new Error("offline"); })).rejects.toThrow("offline");
      expect(calls).toBe(1);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

// The server hands the link to Python's webbrowser. Every other browser is stubbed, so a fallback is recorded
// instead of opening the user's default browser.
const WEBBROWSER = `
import json, sys, webbrowser
hook, mode, url = sys.argv[1:4]
fallback, real_get = [], webbrowser.get
class Fallback:
    def __init__(self, name): self.name = name
    def open(self, *args, **kwargs): fallback.append(self.name); return True
webbrowser.get = lambda name=None: real_get(name) if name is not None and (name.lower() == hook.lower() or "%s" in name) else Fallback(name)
if mode == "open": opened = webbrowser.open(url)
else: webbrowser.register_standard_browsers(); opened = webbrowser.GenericBrowser(hook).open(url)
print(json.dumps({"opened": opened, "first": webbrowser._tryorder[0] == hook, "fallback": fallback}))
`;
function python(): string | null { return spawnSync("python3", ["--version"]).status === 0 ? "python3" : null; }
describe.skipIf(!python())("Antigravity BROWSER hook", () => {
  it("prints the link marker through Python webbrowser, from a path with a space, without falling back", () => {
    const root = mkdtempSync(join(tmpdir(), "doan agy hook "));
    try {
      const hook = new AuthStorage(root, fakeCipher()).ownedScript(BROWSER_HOOK.name, BROWSER_HOOK.script);
      for (const mode of ["open", "generic"]) {
        const run = spawnSync("python3", ["-I", "-c", WEBBROWSER, hook, mode, LINK], { env: { PATH: process.env.PATH ?? "", BROWSER: hook }, encoding: "utf8", timeout: 10_000 });
        expect({ mode, result: JSON.parse(run.stdout || "null"), marker: run.stderr.includes(`${AUTH_LINK_MARKER}${LINK}`) }).toEqual({ mode, result: { opened: true, first: true, fallback: [] }, marker: true });
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
