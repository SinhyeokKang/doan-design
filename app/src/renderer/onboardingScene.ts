import type { AuthSnapshot } from "../main/agentAuth/ipc";
import type { Provider } from "../main/agentAuth/types";

export type Scene = "welcome" | "buddy" | "agent" | "project" | "home";
// Results started on an earlier scene are dropped.
export interface Fence { generation: number }
export interface SceneState extends Fence { scene: Scene }
export type SceneEvent =
  | { type: "start" } | { type: "continue" } | { type: "back" } | { type: "escape" }
  | { type: "step"; to: SetupStep }
  // The renderer never decides completion itself.
  | { type: "completed" };
// busy locks Back and the stepper.
export interface SceneGuard { auth: AuthSnapshot | null; busy: boolean }

export function initialScene(completed: boolean): SceneState { return { scene: completed ? "home" : "welcome", generation: 0 }; }
// agent-auth owns readiness; onboarding only asks whether any provider is ready.
export function canAdvance(auth: AuthSnapshot | null): boolean { return !!auth && auth.providers.some(p => p.readiness.ready); }

// Welcome is before them and Home after.
export type SetupStep = "buddy" | "agent" | "project";
const STEPS: readonly { step: SetupStep; title: string }[] = [{ step: "buddy", title: "Buddy" }, { step: "agent", title: "Agent" }, { step: "project", title: "Project" }];

function target(state: SceneState, event: SceneEvent, guard: SceneGuard): Scene | null {
  const at = STEPS.findIndex(item => item.step === state.scene);
  switch (event.type) {
    case "start": return state.scene === "welcome" ? "buddy" : null;
    // Choosing a buddy does not need an agent.
    case "continue": return state.scene === "buddy" ? "agent" : state.scene === "agent" && canAdvance(guard.auth) ? "project" : null;
    case "back": return guard.busy ? null : state.scene === "project" ? "agent" : state.scene === "agent" ? "buddy" : state.scene === "buddy" ? "welcome" : null;
    case "step": {
      const to = STEPS.findIndex(item => item.step === event.to);
      if (at < 0 || to === at) return null;
      // Back to a done step, unless setup or completion is running.
      if (to < at) return guard.busy ? null : event.to;
      // Forward: Agent needs nothing; Project needs a ready agent.
      return event.to === "agent" || canAdvance(guard.auth) ? event.to : null;
    }
    case "completed": return state.scene === "project" ? "home" : null;
    // Top-level Escape neither closes onboarding nor skips a step.
    case "escape": return null;
  }
}
// A refused event returns the same object, so callers can compare by identity.
export function nextScene(state: SceneState, event: SceneEvent, guard: SceneGuard): SceneState {
  const scene = target(state, event, guard);
  return scene === null ? state : { scene, generation: state.generation + 1 };
}

export interface StepperItem { step: SetupStep; n: number; title: string; state: "done" | "current" | "ahead"; label: string | null }
// label: a done step's visible number is replaced by a check.
export function setupSteps(scene: Scene): StepperItem[] {
  const at = STEPS.findIndex(item => item.step === scene);
  return STEPS.map((item, i) => {
    const state = i < at ? "done" : i === at ? "current" : "ahead";
    return { ...item, n: i + 1, state, label: state === "done" ? `${item.title}, completed` : null };
  });
}

// A new URL or folder outdates lookups started for the previous one.
export function advance<T extends Fence>(fence: T): T { return { ...fence, generation: fence.generation + 1 }; }

// onAgentAuth already drops older snapshots, but a readAgentAuth reply can still arrive after a newer event.
export function newerAuth(current: AuthSnapshot | null, incoming: AuthSnapshot): AuthSnapshot {
  return current && current.revision >= incoming.revision ? current : incoming;
}
// This window's running sign-ins, which Continue with another provider ready cancels.
export function ownedSignIns(auth: AuthSnapshot | null, owned: readonly string[]): { provider: Provider; attemptId: string }[] {
  return (auth?.providers ?? []).flatMap(p => p.attempt?.kind === "signIn" && !p.attempt.cancelling && owned.includes(p.attempt.id) ? [{ provider: p.provider, attemptId: p.attempt.id }] : []);
}
