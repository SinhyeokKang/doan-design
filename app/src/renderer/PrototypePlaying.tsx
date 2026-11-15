import { useEffect } from "react";
import type { PrototypePlaying as Playing } from "../main/prototype/ipc";
import { prototypeMainCalls } from "./prototype/mainCalls";

// The frame the prototype window plays, for the toolbar's frame drawer: main's pushes, and its answer when no push came
// first. Its own component, so App's harness, which runs no child effects, needs no prototype calls.
export function PrototypePlaying({ onChange }: { onChange(playing: Playing | null): void }) {
  useEffect(() => {
    let pushed = false;
    const calls = prototypeMainCalls();
    const stop = calls.onPrototypePlaying(playing => { pushed = true; onChange(playing); });
    void calls.readPrototypePlaying().then(playing => { if (!pushed) onChange(playing); }, console.error);
    return stop;
  }, [onChange]);
  return null;
}
