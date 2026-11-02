import type { ShellProject } from "../restore/uiState";

const hues = ["rose", "orange", "amber", "emerald", "teal", "sky", "indigo", "fuchsia"] as const;
export function projectHue(name: string): typeof hues[number] {
  let hash = 5381;
  for (const point of name.trim()) hash = ((hash * 33) ^ point.codePointAt(0)!) >>> 0;
  return hues[hash % hues.length]!;
}
// The thumbnail letter, shared by the sidebar and onboarding project cards.
export function projectInitial(name: string): string { return Array.from(name.trim())[0]?.toUpperCase() ?? "?"; }
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
    // Open is the default, so a rejoined group stays closed only where every earlier project had closed it.
    const groups = previous.length ? (["ds", "canvases"] as const).filter(id => previous.every(item => item.groups?.[id] === false)) : [];
    return [group.key, { roots: group.roots, expanded: previous.some(item => item.expanded), ...(selected?.selectedRoot ? { selectedRoot: selected.selectedRoot, ...(selected.selectedAt !== undefined ? { selectedAt: selected.selectedAt } : {}) } : {}), ...(groups.length ? { groups: Object.fromEntries(groups.map(id => [id, false])) as NonNullable<ShellProject["groups"]> } : {}) }];
  }));
}

// The loaded project's sidebar row (dogfooding #2, PRODUCT §5 item 3 'Project Overview' "the sidebar project row"):
// elsewhere it re-enters the workspace; on a canvas it opens the Overview; on the Overview it opens the row's slot.
// From Home and the Project Settings page, which shows Home's sidebar (project-settings design '화면'), the row opens the
// Overview rather than re-entering the last canvas (user decision); another page goes back to the loaded workspace as it
// was.
export function loadedProjectRow(at: { screen: string; overviewShown: boolean }): "enter" | "overview" | "slot" {
  if (at.screen === "home" || at.screen === "projectSettings") return "overview";
  if (at.screen !== "workspace") return "enter";
  return at.overviewShown ? "slot" : "overview";
}

// The header's Projects tab leaves a page for where it came from, and from a workspace goes Home (dogfooding #2).
export function projectsTab(screen: string): "leavePage" | "home" | "stay" {
  if (screen === "addProjects" || screen === "settings" || screen === "projectSettings") return "leavePage";
  return screen === "workspace" ? "home" : "stay";
}
