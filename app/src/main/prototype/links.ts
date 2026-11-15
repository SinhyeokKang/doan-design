import { parsePrototypeMark } from "./mark";
import type { LayoutFrameMark } from "./playability";

export function linkGroups(
  frames: readonly LayoutFrameMark[],
  gotos: readonly { value: string; frames: readonly string[] }[],
): string[][] {
  // Count duplicates across all supplied frames before filtering, so shared ids cannot become playable.
  // Supplying only playable frames must produce the same groups.
  const counts = new Map<string, number>();
  for (const { id } of frames) counts.set(id, (counts.get(id) ?? 0) + 1);

  const parent = new Map<string, string>();
  for (const { id, prototype } of frames) {
    // Match Go's prototypeIDMax and the app's MAX_REPORT_STRING UTF-16 cap: no window can play a longer id.
    if (id !== "" && id.length <= 200 && counts.get(id) === 1 && parsePrototypeMark(prototype) !== null) {
      parent.set(id, id);
    }
  }

  function root(id: string): string {
    const path: string[] = [];
    let found = id;
    let next = parent.get(found);
    while (next !== undefined && next !== found) {
      path.push(found);
      found = next;
      next = parent.get(found);
    }
    for (const member of path) parent.set(member, found);
    return found;
  }

  for (const goto of gotos) {
    if (!parent.has(goto.value)) continue;
    for (const from of goto.frames) {
      if (parent.has(from)) parent.set(root(from), root(goto.value));
    }
  }

  const groups = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const key = root(id);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [id]);
    else group.push(id);
  }
  return [...groups.values()];
}
