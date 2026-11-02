import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseReplyAnchor } from "./replyAnchor";

describe("parseReplyAnchor", () => {
  it("reads a frame link and an element link", () => {
    expect(parseReplyAnchor("doan:drafts/frame/editor")).toEqual({ canvas: "drafts", kind: "frame", id: "editor" });
    expect(parseReplyAnchor("doan:drafts/element/save")).toEqual({ canvas: "drafts", kind: "element", id: "save" });
    expect(parseReplyAnchor("doan:buzz-checkout-2/frame/a")).toEqual({ canvas: "buzz-checkout-2", kind: "frame", id: "a" });
  });

  it("decodes the id, so a Korean or spaced id and an encoded slash pass", () => {
    expect(parseReplyAnchor(`doan:drafts/frame/${encodeURIComponent("저장 화면")}`)).toEqual({ canvas: "drafts", kind: "frame", id: "저장 화면" });
    expect(parseReplyAnchor("doan:drafts/element/a%2Fb")).toEqual({ canvas: "drafts", kind: "element", id: "a/b" });
    expect(parseReplyAnchor("doan:drafts/element/a%3Fb%23c")).toEqual({ canvas: "drafts", kind: "element", id: "a?b#c" });
    expect(parseReplyAnchor("doan:drafts/frame/%20")).toEqual({ canvas: "drafts", kind: "frame", id: " " });
  });

  it("rejects what has no canvas, kind and id", () => {
    expect(parseReplyAnchor("doan:x")).toBeNull();
    expect(parseReplyAnchor("doan:")).toBeNull();
    expect(parseReplyAnchor("doan:drafts/frame")).toBeNull();
    expect(parseReplyAnchor("doan:drafts/frame/")).toBeNull();
    expect(parseReplyAnchor("doan:drafts/element/%00")).toBeNull();
  });

  it("splits before decoding, so an unencoded slash makes four pieces", () => {
    expect(parseReplyAnchor("doan:d/frame/a/b")).toBeNull();
    expect(parseReplyAnchor("doan:drafts/frame/a/")).toBeNull();
    expect(parseReplyAnchor("doan:/drafts/frame/a")).toBeNull();
  });

  it("holds the canvas id to the canvas id pattern", () => {
    for (const canvas of ["Drafts", "my_canvas", "-drafts", "drafts-", "dra--fts", "dra fts", "드래프트", ""]) {
      expect(parseReplyAnchor(`doan:${canvas}/frame/a`), canvas).toBeNull();
    }
  });

  it("takes frame and element only", () => {
    expect(parseReplyAnchor("doan:drafts/point/a")).toBeNull();
    expect(parseReplyAnchor("doan:drafts/Frame/a")).toBeNull();
    expect(parseReplyAnchor("doan:drafts/section/a")).toBeNull();
  });

  it("rejects a broken percent encoding", () => {
    expect(parseReplyAnchor("doan:drafts/frame/%E0%A4%A")).toBeNull();
    expect(parseReplyAnchor("doan:drafts/frame/%")).toBeNull();
    expect(parseReplyAnchor("doan:drafts/frame/%ZZ")).toBeNull();
  });

  it("rejects a raw ? or #, which would make a query or a fragment", () => {
    expect(parseReplyAnchor("doan:drafts/frame/a?b=1")).toBeNull();
    expect(parseReplyAnchor("doan:drafts/frame/a#top")).toBeNull();
    expect(parseReplyAnchor("doan:drafts/frame/?")).toBeNull();
  });

  it("rejects a control character after decoding", () => {
    for (const code of ["%00", "%0A", "%0D", "%09", "%1F", "%7F", "%C2%85"]) {
      expect(parseReplyAnchor(`doan:drafts/frame/a${code}b`), code).toBeNull();
    }
  });

  it("takes an id of 200 UTF-16 units and rejects 201 without truncating", () => {
    expect(parseReplyAnchor(`doan:drafts/frame/${"a".repeat(200)}`)?.id).toBe("a".repeat(200));
    expect(parseReplyAnchor(`doan:drafts/frame/${"a".repeat(201)}`)).toBeNull();
    // The limit counts the decoded id, in UTF-16 units: an emoji is two.
    expect(parseReplyAnchor(`doan:drafts/frame/${encodeURIComponent("😀".repeat(100))}`)?.id).toBe("😀".repeat(100));
    expect(parseReplyAnchor(`doan:drafts/frame/${encodeURIComponent("😀".repeat(100) + "a")}`)).toBeNull();
    expect(parseReplyAnchor(`doan:drafts/frame/${"%61".repeat(201)}`)).toBeNull();
  });

  it("accepts only the lowercase scheme and not the deep link form", () => {
    expect(parseReplyAnchor("DOAN:drafts/frame/a")).toBeNull();
    expect(parseReplyAnchor("Doan:drafts/frame/a")).toBeNull();
    expect(parseReplyAnchor("doan://open?root=%2Fr&canvas=a.html")).toBeNull();
    expect(parseReplyAnchor("doan://drafts/frame/a")).toBeNull();
    expect(parseReplyAnchor("https://drafts/frame/a")).toBeNull();
    expect(parseReplyAnchor(" doan:drafts/frame/a")).toBeNull();
  });

  it("returns exactly canvas, kind and id", () => {
    expect(Object.keys(parseReplyAnchor("doan:drafts/element/save")!).sort()).toEqual(["canvas", "id", "kind"]);
  });

  // The renderer and the eval import this file; a value import would drag a main module into the renderer bundle (POSTMORTEM 2026-10-30).
  it("has no import at all", () => {
    expect(readFileSync(new URL("./replyAnchor.ts", import.meta.url), "utf8")).not.toMatch(/^\s*(import|export\s.*\sfrom)\s/m);
  });
});
