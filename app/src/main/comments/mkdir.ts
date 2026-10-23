import { utilityProcess } from "electron";
import { fileURLToPath } from "node:url";

export class MkdirTerminationUnconfirmedError extends Error {
  constructor(cause: unknown) { super("Mkdir child termination unconfirmed; creation may have occurred", { cause }); }
}

export function createCommentDirectory(parent: string, name: ".doan" | "comments"): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(fileURLToPath(new URL("./mkdir-child.js", import.meta.url)), [], { stdio: "ignore" });
    let received = false;
    let failure: Error | undefined;
    let stopping = false;
    let settled = false;
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
    const kill = () => {
      try { if (!child.kill()) failure ??= new Error("Mkdir child termination failed"); }
      catch (error) { failure ??= error instanceof Error ? error : new Error("Mkdir child termination failed"); }
    };
    const spawn = () => { if (stopping) kill(); };
    const stop = () => {
      if (stopping) return;
      stopping = true;
      cleanupTimer = setTimeout(() => {
        clearTimeout(timer);
        settled = true;
        child.removeListener("message", message);
        // Keep only spawn/exit observation when termination is unconfirmed.
        // A late spawn is killed; a late exit removes these remaining listeners.
        kill();
        reject(new MkdirTerminationUnconfirmedError(failure));
      }, 1_000);
      kill();
    };
    const timer = setTimeout(() => {
      failure = new Error("Mkdir child timeout; creation may have occurred");
      stop();
    }, 10_000);
    const message = (value: unknown) => {
      if (received) failure = new Error("Duplicate mkdir result");
      else {
        received = true;
        if (typeof value !== "object" || value === null || !("ok" in value)) failure = new Error("Malformed mkdir result");
        else if (value.ok === true && Object.keys(value).length === 1) { /* Wait for exit. */ }
        else if (value.ok === false && "error" in value && typeof value.error === "string" && Object.keys(value).length === 2) failure = new Error(value.error);
        else failure = new Error("Malformed mkdir result");
      }
      stop();
    };
    const exit = (code: number) => {
      clearTimeout(timer);
      clearTimeout(cleanupTimer);
      child.removeListener("message", message);
      child.removeListener("spawn", spawn);
      child.removeListener("exit", exit);
      if (settled) return;
      settled = true;
      if (failure) reject(failure);
      else if (!received) reject(new Error(`Mkdir child exited before result (${code})`));
      else resolve();
    };
    child.on("message", message);
    child.on("spawn", spawn);
    child.once("exit", exit);
    try { child.postMessage({ parent, name }); } catch (error) {
      failure = error instanceof Error ? error : new Error("Mkdir request failed");
      stop();
    }
  });
}
