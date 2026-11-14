import type { ShellProject } from "../restore/uiState";
import type { History } from "./shellNavigation";

export interface RemovedState { shellProjects: Record<string, ShellProject>; expanded: Record<string, string[]>; history: History }

// What the window forgets about roots that left the list, for the menu's Remove from Doan and for `doan remove`
// (folders:removed) alike. Each part, and the whole, keeps its identity when it holds none of the roots, so a second
// pass for the same roots changes nothing and sets no state.
export function afterRemoved(state: RemovedState, paths: readonly string[]): RemovedState {
  const gone = (root: string) => paths.includes(root);
  const touched = Object.values(state.shellProjects).some(project => project.roots.some(gone));
  const shellProjects = !touched ? state.shellProjects : Object.fromEntries(Object.entries(state.shellProjects).flatMap(([key, project]) => {
    if (!project.roots.some(gone)) return [[key, project]];
    const roots = project.roots.filter(root => !gone(root));
    return roots.length ? [[key, { roots, expanded: project.expanded, ...(project.selectedRoot && roots.includes(project.selectedRoot) ? { selectedRoot: project.selectedRoot, ...(project.selectedAt !== undefined ? { selectedAt: project.selectedAt } : {}) } : {}), ...(project.groups ? { groups: project.groups } : {}) }]] : [];
  }));
  const expanded = !Object.keys(state.expanded).some(gone) ? state.expanded : Object.fromEntries(Object.entries(state.expanded).filter(([root]) => !gone(root)));
  const { visits, cursor } = state.history;
  // The cursor stays on the last visit at or before it that is left.
  const history = !visits.some(visit => gone(visit.root)) ? state.history
    : { visits: visits.filter(visit => !gone(visit.root)), cursor: visits.slice(0, cursor + 1).filter(visit => !gone(visit.root)).length - 1 };
  if (shellProjects === state.shellProjects && expanded === state.expanded && history === state.history) return state;
  return { shellProjects, expanded, history };
}
