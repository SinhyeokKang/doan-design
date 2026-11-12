import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { StatusMark } from "./ConversationLine";

test("an unread finished conversation shows the speech bubble with its label, the other marks keep theirs", () => {
  const unseen = renderToStaticMarkup(<StatusMark status={{ kind: "unseen", label: "Conversation finished — unread" }} />);
  expect(unseen).toMatch(/<span class="row-slot ended" role="img" aria-label="Conversation finished — unread"><svg[^>]*lucide-message-circle/);
  expect(unseen).not.toContain("<i>");
  expect(renderToStaticMarkup(<StatusMark status={{ kind: "working", label: "Working" }} />)).toContain("doan-spinner");
  expect(renderToStaticMarkup(<StatusMark status={{ kind: "permission", label: "Needs your answer" }} />)).toContain("lucide-hand");
});
