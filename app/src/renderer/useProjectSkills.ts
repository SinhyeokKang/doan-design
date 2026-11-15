import { useEffect, useRef, useState } from "react";
import type { Provider } from "../main/agentAuth/types";
import type { SkillSummary } from "../main/conversation/types";
import type { DoanApi } from "../preload";
import type { ComposerTurn } from "./composerRules";

const EMPTY: readonly SkillSummary[] = [];
// Each reply updates only its own root/provider entry, including replies after navigation.
// The list is read again when a turn ends, so a skill the agent made shows at once. A held turn has ended (main only
// judges it or sends its queue), so it counts with idle: running → holding reads, holding → idle does not.
const ended = (turn: ComposerTurn) => turn === "idle" || turn === "holding";
// `calls`: `window.doan`, or the prototype window's same member.
export type SkillsCalls = Pick<DoanApi, "listConversationSkills">;
export function useProjectSkills(calls: SkillsCalls, root: string | null, provider: Provider | null, turn: ComposerTurn, generation = 0) {
  const [lists, setLists] = useState<Record<string, readonly SkillSummary[]>>({});
  // A read asked while one for the same key is pending runs once after it: the pending reply may predate the skill a
  // turn that has just ended made. Several such asks are one read.
  const pending = useRef(new Map<string, { again: boolean }>());
  const key = JSON.stringify([root, provider, generation]);
  const supported = provider === "claude" || provider === "codex";
  const fetch = (root: string, provider: Provider, key: string) => {
    const entry = { again: false };
    pending.current.set(key, entry);
    void calls.listConversationSkills({ root, provider }).then(reply => {
      if ("skills" in reply) setLists(current => ({ ...current, [key]: reply.skills }));
    }).catch(error => console.error("Could not read project skills", error)).finally(() => {
      pending.current.delete(key);
      if (entry.again) fetch(root, provider, key);
    });
  };
  const read = () => {
    if (!root || !provider || !supported) return;
    const inFlight = pending.current.get(key);
    if (inFlight) inFlight.again = true; else fetch(root, provider, key);
  };
  useEffect(() => { read(); }, [key]);
  const previous = useRef({ key, turn });
  useEffect(() => {
    if (previous.current.key === key && !ended(previous.current.turn) && ended(turn)) read();
    previous.current = { key, turn };
  }, [key, turn]);
  return { skills: supported ? lists[key] ?? EMPTY : EMPTY, read };
}
