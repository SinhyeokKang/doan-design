import { useEffect, useRef, useState } from "react";
import type { Provider } from "../main/agentAuth/types";
import type { SkillSummary } from "../main/conversation/types";
import type { ComposerTurn } from "./composerRules";

const EMPTY: readonly SkillSummary[] = [];
// Each reply updates only its own root/provider entry, including replies after navigation.
// The list is read again when a turn ends, so a skill the agent made shows at once. A held turn has ended (main only
// judges it or sends its queue), so it counts with idle: running → holding reads, holding → idle does not.
const ended = (turn: ComposerTurn) => turn === "idle" || turn === "holding";
export function useProjectSkills(root: string | null, provider: Provider | null, turn: ComposerTurn, generation = 0) {
  const [lists, setLists] = useState<Record<string, readonly SkillSummary[]>>({});
  const pending = useRef(new Set<string>());
  const key = JSON.stringify([root, provider, generation]);
  const supported = provider === "claude" || provider === "codex";
  const read = () => {
    if (!root || !provider || !supported || pending.current.has(key)) return;
    pending.current.add(key);
    void window.doan.listConversationSkills({ root, provider }).then(reply => {
      if ("skills" in reply) setLists(current => ({ ...current, [key]: reply.skills }));
    }).catch(error => console.error("Could not read project skills", error)).finally(() => pending.current.delete(key));
  };
  useEffect(() => { read(); }, [key]);
  const previous = useRef({ key, turn });
  useEffect(() => {
    if (previous.current.key === key && !ended(previous.current.turn) && ended(turn)) read();
    previous.current = { key, turn };
  }, [key, turn]);
  return { skills: supported ? lists[key] ?? EMPTY : EMPTY, read };
}
