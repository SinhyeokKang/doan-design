import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, expect, test } from "vitest";
import { launchElectronDom, type ElectronDom } from "../../runtime/electronDom";
import { ConversationThread, Steps, type ConversationThreadProps } from "./ConversationThread";
import { TooltipProvider } from "./components/ui/tooltip";

let dom: ElectronDom;
beforeAll(async () => { dom = await launchElectronDom(); }, 30_000);
afterAll(async () => { await dom?.close(); }, 30_000);
const css = ["tokens.css", "styles.css"].map(file => readFileSync(new URL(file, import.meta.url), "utf8").replace(/^@import .*;$/gm, "")).join("\n");
const noop = () => {};

for (const pressable of [false, true]) {
  test(`sent chip selection keeps inline names and list whitespace (${pressable ? "button" : "span"})`, async () => {
    const texts = ["Align {{1}} - stays", "- Align {{1}} - stays\n  * Keep {{1}} inline\n    3. {{1}} end\n\nAfter {{1}}."];
    const props: ConversationThreadProps = {
      items: texts.map((text, i) => ({ kind: "user", key: `u${i}`, seq: i + 1, anchors: [{ frame: { id: "hero", title: "Hero" } }], preset: null, attachments: [],
        parts: text.split(/(\{\{1\}\})/).map(part => part === "{{1}}" ? { anchor: 1 } : { text: part }) })),
      conversationId: "copy", provider: "claude", project: "copy", liveAfter: 0, canvasListed: () => true,
      visibility: { onWindowVisible: () => noop }, now: 0, onAnswer: noop, onStop: noop, onEditAndResend: noop,
      onSignIn: noop, onRetry: noop, onOpenCanvas: noop, onOpenLink: noop, onCopy: async () => true,
      ...(pressable ? { onLocate: async () => "shown" as const } : {}),
    };
    const frame = await dom.load(`<style>${css}</style>${renderToStaticMarkup(<TooltipProvider><ConversationThread {...props} /></TooltipProvider>)}`);
    const selected = await frame.evaluate(() => [...document.querySelectorAll(".bubble")].map(bubble => {
      const range = document.createRange(); range.selectNodeContents(bubble);
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      return selection.toString();
    }));
    expect(selected).toEqual(texts.map(text => text.replaceAll("{{1}}", "Hero")));
  });
}

test("a copied edit step gives its verb, path and counts on their own lines, without the counts' spoken name", async () => {
  const markup = renderToStaticMarkup(<div className="conversation-thread"><Steps id="s" steps={[
    { key: "s1", kind: "edit", verb: "Edited", path: "a.ts", lines: { added: 12, removed: 3 } },
    { key: "s2", kind: "edit", verb: "Edited", path: "b.ts" },
  ]} /></div>);
  const frame = await dom.load(`<style>${css}</style>${markup}`);
  const selected = await frame.evaluate(() => [...document.querySelectorAll(".activity-steps li")].map(step => {
    const range = document.createRange(); range.selectNodeContents(step);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    return selection.toString();
  }));
  expect(selected).toEqual(["Edited\na.ts\n+12 −3", "Edited\nb.ts"]);
});
