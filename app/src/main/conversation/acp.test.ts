import { expect, it } from "vitest";
import { acpPermission, acpQuestion } from "./acp";

// The shape Antigravity's ACP server 1.3.0 sent for a question (agent-questions P5): a standard permission request whose
// options are the answers, all allow_once, with no reject option.
function asked(over: Record<string, unknown> = {}, options: { optionId: string; name?: string; kind: string }[] = [{ optionId: "1", name: "Red", kind: "allow_once" }, { optionId: "2", name: "Blue", kind: "allow_once" }]) {
  return { sessionId: "s", toolCall: { toolCallId: "interaction_1", title: "Which color should the header be?", rawInput: {} }, options, ...over };
}

it("reads Antigravity's question-shaped permission request as one single-choice question with no header", () => {
  expect(acpQuestion(asked(), "req")).toEqual({
    event: { type: "question.request", requestId: "req", questions: [{ id: "0", header: "", question: "Which color should the header be?", options: [{ label: "Red" }, { label: "Blue" }], multiSelect: false, other: false }] },
    optionIds: ["1", "2"],
  });
});

it("leaves every other shape to the permission request", () => {
  const cases = [
    // A reject option means a real permission: Allow and Deny keep their meaning.
    asked({}, [{ optionId: "1", name: "Red", kind: "allow_once" }, { optionId: "2", name: "Blue", kind: "allow_once" }, { optionId: "r", name: "No", kind: "reject_once" }]),
    asked({}, [{ optionId: "1", name: "Allow", kind: "allow_once" }, { optionId: "r", name: "Deny", kind: "reject_once" }]),
    asked({}, [{ optionId: "1", name: "Red", kind: "allow_once" }, { optionId: "2", name: "Always", kind: "allow_always" }]),
    // One option is nothing to choose between.
    asked({}, [{ optionId: "1", name: "Red", kind: "allow_once" }]),
    // Two answers with the same name could not be told apart.
    asked({}, [{ optionId: "1", name: "Red", kind: "allow_once" }, { optionId: "2", name: "Red", kind: "allow_once" }]),
    asked({}, [{ optionId: "1", name: "Red", kind: "allow_once" }, { optionId: "2", name: "", kind: "allow_once" }]),
    asked({}, [{ optionId: "1", name: "Red", kind: "allow_once" }, { optionId: "2", kind: "allow_once" }]),
    asked({ toolCall: { toolCallId: "interaction_1", title: "" } }),
    asked({ toolCall: { toolCallId: "interaction_1" } }),
    asked({ toolCall: "x" }),
    asked({ options: "x" }),
    // Past the limits: refused, never cut, so the request stays answerable as a permission.
    asked({ toolCall: { toolCallId: "interaction_1", title: "q".repeat(4097) } }),
    asked({}, Array.from({ length: 9 }, (_, i) => ({ optionId: String(i), name: `Option ${i}`, kind: "allow_once" }))),
    asked({}, [{ optionId: "1", name: "R".repeat(513), kind: "allow_once" }, { optionId: "2", name: "Blue", kind: "allow_once" }]),
    asked({}, [{ optionId: "1".repeat(513), name: "Red", kind: "allow_once" }, { optionId: "2", name: "Blue", kind: "allow_once" }]),
  ];
  for (const params of cases) expect(acpQuestion(params, "req")).toBeNull();
  // At the limits it is still a question.
  expect(acpQuestion(asked({ toolCall: { title: "q".repeat(4096) } }, Array.from({ length: 8 }, (_, i) => ({ optionId: String(i), name: "n".repeat(511) + i, kind: "allow_once" }))), "req")?.event.questions[0]!.options).toHaveLength(8);
  // The same question-shaped request still reads as a permission where the runner does not take questions.
  expect(acpPermission(asked(), "req")?.event).toMatchObject({ type: "permission.request", summary: "Which color should the header be?", options: [{ id: "allow" }] });
});
