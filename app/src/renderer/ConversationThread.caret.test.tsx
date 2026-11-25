import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

// The streaming caret while a reply's last code line still fades: the reveal state is injected (the hook's useState),
// since a static render runs no frames.
const TEXT = "Here:\n\n```ts\nconst a = 1;\nconst b = 2;\n";
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  return { ...actual, useState: (init: unknown) => {
    const pair = actual.useState(init);
    const value = pair[0] as { arrivals?: unknown } | null;
    if (value && typeof value === "object" && "arrivals" in value)
      return [{ shown: TEXT.length, runs: [{ from: TEXT.indexOf("const b"), to: TEXT.length, at: 1000 }], arrivals: [], doneAt: null, at: 1000 }, pair[1]];
    return pair;
  } };
});
const { ConversationThread } = await import("./ConversationThread");
const { TooltipProvider } = await import("./components/ui/tooltip");
const noop = () => {};

test("the caret stays on a code block's last line while that line fades, so the block does not grow a line", () => {
  const out = renderToStaticMarkup(<TooltipProvider><ConversationThread items={[{ kind: "agent", key: "m1", messageId: "m1", text: TEXT, streaming: true }]}
    conversationId="c1" provider="claude" project="p" liveAfter={0} canvasListed={() => true} visibility={{ onWindowVisible: () => () => {} }} now={0}
    onAnswer={noop} onStop={noop} onEditAndResend={noop} onSignIn={noop} onRetry={noop} onOpenCanvas={noop} onOpenHandoff={noop} onOpenLink={noop} onCopy={async () => true} /></TooltipProvider>);
  const code = /<pre[^>]*>[\s\S]*?<\/pre>/.exec(out)![0];
  expect(code).toContain('<span class="reveal-run"');
  expect(code).toMatch(/const b = 2;(<\/span>)?<span class="caret"[^>]*><\/span>\n<\/code>/);
});
