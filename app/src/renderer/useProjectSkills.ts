import { useEffect, useRef, useState } from "react";
import type { Provider } from "../main/agentAuth/types";
import type { SkillSummary } from "../main/conversation/types";
import type { DoanApi } from "../preload";
import type { ComposerTurn } from "./composerRules";

const EMPTY: readonly SkillSummary[] = [];
const NONE: readonly string[] = [];
interface Listed { skills: readonly SkillSummary[]; passthrough: readonly string[] }
// Read again when a turn ends, so a skill the agent made shows at once. A held turn has ended, so running → holding
// reads and holding → idle does not.
const ended = (turn: ComposerTurn) => turn === "idle" || turn === "holding";
// An ACP agent's commands are per session, so they are read by `conversationId` and listed only once there is one.
// `passthrough`: unconfirmed ACP commands, sent as written but shown in no row.
export type SkillsCalls = Pick<DoanApi, "listConversationSkills">;
export function useProjectSkills(calls: SkillsCalls, root: string | null, provider: Provider | null, turn: ComposerTurn, generation = 0, conversationId?: string | null) {
  const [lists, setLists] = useState<Record<string, Listed>>({});
  // The pending reply may predate the skill a just-ended turn made, so one more read runs after it.
  const pending = useRef(new Map<string, { again: boolean }>());
  const fixedTable = provider === "claude" || provider === "codex";
  const conversation = fixedTable ? null : conversationId ?? null;
  const key = JSON.stringify([root, provider, generation, conversation]);
  const supported = fixedTable || conversation !== null;
  const fetch = (root: string, provider: Provider, key: string) => {
    const entry = { again: false };
    pending.current.set(key, entry);
    void calls.listConversationSkills({ root, provider, ...(conversation !== null ? { conversationId: conversation } : {}) }).then(reply => {
      if ("skills" in reply) setLists(current => ({ ...current, [key]: { skills: reply.skills, passthrough: reply.passthrough ?? NONE } }));
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
  const listed = supported ? lists[key] : undefined;
  return { skills: listed?.skills ?? EMPTY, passthrough: listed?.passthrough ?? NONE, read };
}
