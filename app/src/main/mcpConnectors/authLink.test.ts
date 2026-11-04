import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { mcpAuthLink } from "./authLink";

// Links `claude mcp login` handed to the BROWSER hook in the PoC: Notion (CIMD), Atlassian and Figma (DCR). state,
// code_challenge and the DCR client ids are placeholders.
const link = (name: string) => readFileSync(new URL(`./fixtures/link-${name}.txt`, import.meta.url), "utf8");

test.each(["notion", "atlassian", "figma"])("the %s authorization link passes as it came, whatever its host", name => {
  expect(mcpAuthLink(link(name))).toBe(link(name));
});

test("a 127.0.0.1 callback passes like localhost", () => {
  const raw = link("notion").replace("localhost", "127.0.0.1");
  expect(mcpAuthLink(raw)).toBe(raw);
});

test.each([
  ["http", (raw: string) => raw.replace("https://", "http://")],
  ["a non-web scheme", (raw: string) => raw.replace("https://", "file://")],
  ["user info", (raw: string) => raw.replace("https://", "https://user:pw@")],
  ["a fragment", (raw: string) => `${raw}#x`],
  ["whitespace", (raw: string) => `${raw}\n`],
  ["another response_type", (raw: string) => raw.replace("response_type=code", "response_type=token")],
  ["two response_types", (raw: string) => `${raw}&response_type=code`],
  ["no code_challenge", (raw: string) => raw.replace(/code_challenge=[^&]*&/, "")],
  ["an empty code_challenge", (raw: string) => raw.replace(/code_challenge=[^&]*&/, "code_challenge=&")],
  ["no redirect_uri", (raw: string) => raw.replace(/redirect_uri=[^&]*&/, "")],
  ["a remote redirect", (raw: string) => raw.replace("localhost", "evil.example")],
  ["an https redirect", (raw: string) => raw.replace("http%3A%2F%2Flocalhost", "https%3A%2F%2Flocalhost")],
  ["a redirect without a port", (raw: string) => raw.replace(/%3A\d+%2Fcallback/, "%2Fcallback")],
  ["a privileged redirect port", (raw: string) => raw.replace(/%3A\d+%2Fcallback/, "%3A80%2Fcallback")],
  ["a redirect to another path", (raw: string) => raw.replace("%2Fcallback", "%2Fother")],
  ["a redirect with user info", (raw: string) => raw.replace("http%3A%2F%2Flocalhost", "http%3A%2F%2Fu%40localhost")],
  ["over the length limit", (raw: string) => `${raw}&pad=${"a".repeat(16384)}`],
])("a link with %s is refused", (_, change) => {
  expect(mcpAuthLink(change(link("notion")))).toBeNull();
});

test("text that is not a URL is refused", () => {
  for (const raw of ["", "not a link", "https://"]) expect(mcpAuthLink(raw), raw).toBeNull();
});
