import { expectTypeOf, test } from "vitest";
import type { DoanPrototypeApi } from "../../preload/prototype";
import type { ConversationCalls } from "../CanvasConversationPanel";
import type { ResumeCalls } from "../canvasRun";
import type { StoreCalls } from "../conversationStore";
import type { DockedSupportCalls } from "../dockedSupport";
import type { SkillsCalls } from "../useProjectSkills";
import type { VisibleCalls } from "../visibleClock";
import type { PrototypeConversationCalls } from "./conversationRun";
import type { PrototypeApi } from "./PrototypeWindow";

// The prototype preload must stand in for `window.doan` wherever the panel takes a call object;
// a renamed or reshaped member fails typecheck here.
test("window.doanPrototype is every call object the prototype window's panel hands on", () => {
  expectTypeOf<DoanPrototypeApi>().toExtend<ConversationCalls>();
  expectTypeOf<DoanPrototypeApi>().toExtend<StoreCalls>();
  expectTypeOf<DoanPrototypeApi>().toExtend<DockedSupportCalls>();
  expectTypeOf<DoanPrototypeApi>().toExtend<ResumeCalls>();
  expectTypeOf<DoanPrototypeApi>().toExtend<SkillsCalls>();
  expectTypeOf<DoanPrototypeApi>().toExtend<VisibleCalls>();
  expectTypeOf<DoanPrototypeApi>().toExtend<PrototypeConversationCalls>();
  expectTypeOf<DoanPrototypeApi>().toExtend<PrototypeApi>();
});
