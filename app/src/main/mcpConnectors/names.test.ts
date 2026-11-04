import { expect, test } from "vitest";
import { connectorName, connectorWithUrl, parseConnectorUrl } from "./names";
import { connectorLabel, connectorLabels, MCP_PROVIDERS, PRESETS } from "./presets";

test("the presets are Notion, Atlassian and Figma under fixed doan- names, and only Claude Code and Codex connect", () => {
  expect(PRESETS).toEqual([
    { name: "doan-notion", label: "Notion", url: "https://mcp.notion.com/mcp" },
    { name: "doan-atlassian", label: "Atlassian", url: "https://mcp.atlassian.com/v1/mcp" },
    { name: "doan-figma", label: "Figma", url: "https://mcp.figma.com/mcp" },
  ]);
  expect(MCP_PROVIDERS).toEqual(["claude", "codex"]);
});

test("a URL server is shown by its host; labels cover the presets and every URL server", () => {
  expect(connectorLabel({ name: "doan-example-com", url: "https://example.com/mcp" })).toBe("example.com");
  expect(connectorLabel({ name: "doan-example-com", url: "https://example.com:8443/mcp" })).toBe("example.com:8443");
  expect(connectorLabels([{ name: "doan-example-com", url: "https://example.com/mcp" }])).toEqual({
    "doan-notion": "Notion", "doan-atlassian": "Atlassian", "doan-figma": "Figma", "doan-example-com": "example.com",
  });
});

test("a connector URL is trimmed and normalized: lower-case scheme and host, no default port, one trailing slash dropped", () => {
  expect(parseConnectorUrl("  https://mcp.example.com/mcp \n")).toEqual({ ok: true, url: "https://mcp.example.com/mcp" });
  expect(parseConnectorUrl("HTTPS://MCP.Example.COM/mcp")).toEqual({ ok: true, url: "https://mcp.example.com/mcp" });
  expect(parseConnectorUrl("https://mcp.example.com:443/mcp")).toEqual({ ok: true, url: "https://mcp.example.com/mcp" });
  expect(parseConnectorUrl("https://mcp.example.com:8443/mcp")).toEqual({ ok: true, url: "https://mcp.example.com:8443/mcp" });
  expect(parseConnectorUrl("https://mcp.example.com/mcp/")).toEqual({ ok: true, url: "https://mcp.example.com/mcp" });
  // Only one slash goes, and the path keeps its case.
  expect(parseConnectorUrl("https://mcp.example.com/MCP//")).toEqual({ ok: true, url: "https://mcp.example.com/MCP/" });
  expect(parseConnectorUrl("https://mcp.example.com/mcp/?team=a")).toEqual({ ok: true, url: "https://mcp.example.com/mcp?team=a" });
});

test("a root URL reads the same with or without its slash, and the normalized form is its own URL.href", () => {
  const bare = parseConnectorUrl("https://example.com"), slash = parseConnectorUrl("https://example.com/");
  expect(bare).toEqual(slash);
  for (const read of [bare, slash, parseConnectorUrl("https://mcp.example.com/mcp/"), parseConnectorUrl("https://a.example/x?y=1")]) {
    if (!read.ok) throw new Error("expected a URL");
    expect(new URL(read.url).href).toBe(read.url);
  }
});

test("a connector URL is refused with a reason: empty, too long, not a URL, not https, with credentials or a fragment", () => {
  expect(parseConnectorUrl("")).toEqual({ ok: false, reason: "empty" });
  expect(parseConnectorUrl("   ")).toEqual({ ok: false, reason: "empty" });
  expect(parseConnectorUrl(`https://example.com/${"a".repeat(2048)}`)).toEqual({ ok: false, reason: "too_long" });
  expect(parseConnectorUrl("mcp.notion.com/mcp")).toEqual({ ok: false, reason: "invalid" });
  expect(parseConnectorUrl("https://exa mple.com")).toEqual({ ok: false, reason: "invalid" });
  expect(parseConnectorUrl("https://example.com/m\ncp")).toEqual({ ok: false, reason: "invalid" });
  expect(parseConnectorUrl("http://example.com/mcp")).toEqual({ ok: false, reason: "not_https" });
  expect(parseConnectorUrl("ftp://example.com/mcp")).toEqual({ ok: false, reason: "not_https" });
  expect(parseConnectorUrl("https://user:secret@example.com/mcp")).toEqual({ ok: false, reason: "credentials" });
  expect(parseConnectorUrl("https://user@example.com/mcp")).toEqual({ ok: false, reason: "credentials" });
  expect(parseConnectorUrl("https://example.com/mcp#tools")).toEqual({ ok: false, reason: "fragment" });
  expect(parseConnectorUrl("https://example.com/mcp#")).toEqual({ ok: false, reason: "fragment" });
});

test("a duplicate is found by the normalized URL, the presets included", () => {
  const servers = [{ name: "doan-example-com", url: "https://example.com/mcp" }];
  const read = (text: string) => { const parsed = parseConnectorUrl(text); if (!parsed.ok) throw new Error(text); return parsed.url; };
  expect(connectorWithUrl(read(" HTTPS://MCP.NOTION.COM:443/mcp/ "), servers)).toBe("doan-notion");
  expect(connectorWithUrl(read("https://mcp.figma.com/mcp"), [])).toBe("doan-figma");
  expect(connectorWithUrl(read("https://Example.com/mcp/"), servers)).toBe("doan-example-com");
  expect(connectorWithUrl(read("https://example.com/mcp2"), servers)).toBeNull();
  expect(connectorWithUrl(read("https://mcp.notion.com/v2/mcp"), servers)).toBeNull();
});

test("a URL server's name is doan- and a slug of its host, at most 16 characters of [a-z0-9-]", () => {
  expect(connectorName("https://mcp.example.com/mcp", [])).toBe("doan-mcp-example-com");
  expect(connectorName("https://mcp.example.com:8443/mcp", [])).toBe("doan-mcp-example-com");
  expect(connectorName("https://very-long-host-name.example.com/mcp", [])).toBe("doan-very-long-host-n");
  // A cut that ends on a hyphen drops it.
  expect(connectorName("https://abcdefghijklmno.example.com/mcp", [])).toBe("doan-abcdefghijklmno");
  expect(connectorName("https://xn--bcher-kva.example/mcp", [])).toBe("doan-xn-bcher-kva-exa");
  expect(connectorName("https://[::1]/mcp", [])).toBe("doan-1");
});

test("a slug already taken gets -2, -3, ...; preset names are always taken and the result stays within 16 characters", () => {
  expect(connectorName("https://example.com/a", ["doan-example-com"])).toBe("doan-example-com-2");
  expect(connectorName("https://example.com/b", ["doan-example-com", "doan-example-com-2"])).toBe("doan-example-com-3");
  expect(connectorName("https://notion/mcp", [])).toBe("doan-notion-2");
  const long = "doan-very-long-host-n";
  expect(connectorName("https://very-long-host-name.example.com/b", [long])).toBe("doan-very-long-host-2");
  const names = [long];
  for (let i = 2; i <= 10; i++) names.push(connectorName("https://very-long-host-name.example.com/x", names));
  expect(names.at(-1)).toBe("doan-very-long-hos-10");
  for (const name of names) expect(name).toMatch(/^doan-[a-z0-9][a-z0-9-]{0,15}$/);
});
