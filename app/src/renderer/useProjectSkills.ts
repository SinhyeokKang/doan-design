import { useEffect, useRef, useState } from "react";
import type { Provider } from "../main/agentAuth/types";
import type { SkillSummary } from "../main/conversation/types";

const EMPTY: readonly SkillSummary[] = [];
// Each reply updates only its own root/provider entry, including replies after navigation.
export function useProjectSkills(root: string | null, provider: Provider | null, turn: string, generation = 0) {
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
    if (previous.current.key === key && previous.current.turn !== "idle" && turn === "idle") read();
    previous.current = { key, turn };
  }, [key, turn]);
  return { skills: supported ? lists[key] ?? EMPTY : EMPTY, read };
}
