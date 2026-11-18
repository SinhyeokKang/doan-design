import { describe, expect, it } from "vitest";
import config from "./electron.vite.config";

type IndexHtmlTransform = (html: string, ctx: { server?: { resolvedUrls?: { local: readonly string[] } } }) => { attrs: { content: string } }[];

function policy(ctx: Parameters<IndexHtmlTransform>[1]): Map<string, string> {
  const plugins = (config as { renderer: { plugins: { name: string; transformIndexHtml?: IndexHtmlTransform }[] } }).renderer.plugins;
  const csp = plugins.find((plugin) => plugin.name === "doan-csp");
  const content = csp?.transformIndexHtml?.("", ctx)[0]?.attrs.content ?? "";
  return new Map(content.split(";").map((directive) => {
    const [name = "", ...values] = directive.trim().split(/\s+/);
    return [name, values.join(" ")];
  }));
}

describe("window content security policy", () => {
  for (const [label, ctx] of [["built", {}], ["dev", { server: { resolvedUrls: { local: ["http://localhost:5173/"] } } }]] as const) {
    it(`${label}: refuses base, plugin and form targets`, () => {
      const directives = policy(ctx);
      expect(directives.get("base-uri")).toBe("'none'");
      expect(directives.get("object-src")).toBe("'none'");
      expect(directives.get("form-action")).toBe("'none'");
    });
  }

  it("keeps the built window's own files and loopback canvas frames", () => {
    const directives = policy({});
    expect(directives.get("default-src")).toBe("'self'");
    expect(directives.get("frame-src")).toBe("http://127.0.0.1:*");
    expect(directives.get("img-src")).toBe("'self' blob:");
  });
});
