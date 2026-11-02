import { describe, expect, it } from "vitest";
import { replyUrlTransform } from "./replyUrlTransform";

describe("replyUrlTransform", () => {
  it("leaves a doan: link as it is, deep links included, for the link component to judge", () => {
    expect(replyUrlTransform("doan:drafts/frame/editor")).toBe("doan:drafts/frame/editor");
    expect(replyUrlTransform("doan:drafts/element/%EC%A0%80%EC%9E%A5")).toBe("doan:drafts/element/%EC%A0%80%EC%9E%A5");
    expect(replyUrlTransform("doan://open?root=%2Fr&canvas=a.html")).toBe("doan://open?root=%2Fr&canvas=a.html");
  });

  it("keeps https: and the other default-safe URLs", () => {
    expect(replyUrlTransform("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(replyUrlTransform("mailto:a@example.com")).toBe("mailto:a@example.com");
    expect(replyUrlTransform("/relative/path")).toBe("/relative/path");
  });

  it("blanks the protocols the default blanks", () => {
    expect(replyUrlTransform("javascript:alert(1)")).toBe("");
    expect(replyUrlTransform("data:text/html,x")).toBe("");
    expect(replyUrlTransform("file:///etc/passwd")).toBe("");
  });

  it("does not widen the scheme match: only a lowercase doan: prefix passes", () => {
    expect(replyUrlTransform("DOAN:drafts/frame/a")).toBe("");
    expect(replyUrlTransform("xdoan:drafts/frame/a")).toBe("");
  });
});
