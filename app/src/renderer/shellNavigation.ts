import type { ShellProject } from "../restore/uiState";

const hues = ["rose", "orange", "amber", "emerald", "teal", "sky", "indigo", "fuchsia"] as const;
export function projectHue(name: string): typeof hues[number] {
  let hash = 5381;
  for (const point of name.trim()) hash = ((hash * 33) ^ point.codePointAt(0)!) >>> 0;
  return hues[hash % hues.length]!;
}
export function projectExpanded(project: ShellProject, loaded: string | null): boolean {
  return project.expanded || (loaded !== null && project.roots.includes(loaded));
}
export interface Visit { root: string; canvas?: string }
export interface History { visits: Visit[]; cursor: number }
export const emptyHistory = (): History => ({ visits: [], cursor: -1 });
export function commitVisit(history: History, visit: Visit): History {
  const current = history.visits[history.cursor];
  if (current?.root === visit.root && current.canvas === visit.canvas) return history;
  const visits = [...history.visits.slice(0, history.cursor + 1), visit];
  return { visits, cursor: visits.length - 1 };
}
export function historyTarget(history: History, direction: -1 | 1, valid: (visit: Visit) => boolean): number | null {
  for (let index = history.cursor + direction; index >= 0 && index < history.visits.length; index += direction) if (valid(history.visits[index]!)) return index;
  return null;
}
export interface ShellActivity { root: string; at?: number; incomplete: boolean }
export function selectProjectRoot(project: ShellProject, activity: readonly ShellActivity[], loaded: string | null): string | undefined {
  const selected = project.roots.includes(project.selectedRoot ?? "") ? project.selectedRoot : undefined;
  let root = selected ?? (loaded !== null && project.roots.includes(loaded) ? loaded : project.roots[0]);
  let at = selected && project.selectedAt !== undefined ? project.selectedAt : -Infinity;
  for (const candidate of project.roots) {
    const time = activity.find(item => item.root === candidate)?.at;
    if (time !== undefined && (time > at || (time === at && candidate === selected))) { root = candidate; at = time; }
  }
  return root;
}
export function reconcileProjects(saved: Record<string, ShellProject>, groups: readonly { key: string; roots: string[] }[]): Record<string, ShellProject> {
  return Object.fromEntries(groups.map(group => {
    const previous = Object.values(saved).filter(item => item.roots.some(root => group.roots.includes(root)));
    const candidates = previous.filter(item => item.selectedRoot && group.roots.includes(item.selectedRoot));
    candidates.sort((a, b) => (b.selectedAt ?? -Infinity) - (a.selectedAt ?? -Infinity) || group.roots.indexOf(a.selectedRoot!) - group.roots.indexOf(b.selectedRoot!));
    const selected = candidates[0];
    return [group.key, { roots: group.roots, expanded: previous.some(item => item.expanded), ...(selected?.selectedRoot ? { selectedRoot: selected.selectedRoot, ...(selected.selectedAt !== undefined ? { selectedAt: selected.selectedAt } : {}) } : {}) }];
  }));
}
