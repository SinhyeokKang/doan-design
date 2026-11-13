// The page around an exported prototype. The canvas iframe starts hidden: until the isolation
// script in it reports, the iframe would show the whole canvas, other frames and notes included,
// which the sender did not mean to show. It shows on `ready`; on `missing`, or when nothing came
// within LOAD_TIMEOUT_MS, it stays hidden and the line says the frame did not load. A `ready` after
// the timeout still shows the frame (a slow canvas), so the line goes again.

const LOAD_TIMEOUT_MS = 10000;

// phase: "waiting" until the first answer or the timeout, "late" after the timeout with no answer,
// then "ready" or "missing" for good: the isolation script reports once.
function nextPhase(phase, input) {
  if (phase !== "waiting" && phase !== "late") return phase;
  if (input === "ready" || input === "missing") return input;
  if (input === "timeout" && phase === "waiting") return "late";
  return phase;
}

function phaseView(phase) {
  return { frameShown: phase === "ready", lineShown: phase === "missing" || phase === "late" };
}

// Only the iframe's own window, whose sandbox gives it the opaque origin, and only the two states.
function acceptState(event, frameWindow) {
  if (event.source !== frameWindow || event.origin !== "null") return null;
  const data = event.data;
  if (data === null || typeof data !== "object" || data.type !== "doan-prototype") return null;
  return data.state === "ready" || data.state === "missing" ? data.state : null;
}

// This script runs in the head, before the line and the iframe are parsed: the listener has to be in
// place before the iframe can answer. Both elements exist by the time anything arrives.
let phase = "waiting";
function apply(input) {
  phase = nextPhase(phase, input);
  const view = phaseView(phase);
  document.getElementById("prototype").classList.toggle("shown", view.frameShown);
  document.getElementById("line").hidden = !view.lineShown;
}
window.addEventListener("message", (event) => {
  const state = acceptState(event, document.getElementById("prototype")?.contentWindow);
  if (state !== null) apply(state);
});
setTimeout(() => apply("timeout"), LOAD_TIMEOUT_MS);
