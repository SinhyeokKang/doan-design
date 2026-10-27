import { execFile } from "node:child_process";
import { promisify } from "node:util";

export function parseDesktopLock(output: string): boolean {
  const value = output.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Invalid desktop lock state: ${JSON.stringify(value)}`);
}

export async function desktopLocked(): Promise<boolean> {
  // Python is already required by real-state.ts; emit only the lock bit, not user/session metadata.
  const { stdout } = await promisify(execFile)("python3.12", ["-c", `
import plistlib, subprocess
root = plistlib.loads(subprocess.check_output(["/usr/sbin/ioreg", "-a", "-n", "Root", "-d1"], timeout=5))
locked = root["IOConsoleLocked"]
if type(locked) is not bool:
    raise ValueError("Invalid IOConsoleLocked value")
print("true" if locked else "false")
`], { timeout: 10_000 });
  return parseDesktopLock(stdout);
}

export async function assertDesktopUnlocked(readLock = desktopLocked): Promise<void> {
  if (await readLock()) throw new Error("macOS desktop is locked. Unlock the Mac and keep it unlocked during native focus tests.");
}

interface NativeFocus { hidden: boolean; visible: boolean; focused: boolean }

export async function waitForNativeFocus(read: () => Promise<NativeFocus>, name: string, readLock = desktopLocked, timeoutMs = 10_000): Promise<void> {
  await assertDesktopUnlocked(readLock);
  const deadline = Date.now() + timeoutMs;
  let state: NativeFocus | undefined;
  let lastError: unknown;
  for (;;) {
    try {
      state = await read();
      if (!state.hidden && state.visible && state.focused) return;
    } catch (error) { lastError = error; }
    if (Date.now() >= deadline) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  let lock: string;
  try { lock = String(await readLock()); }
  catch (error) { lock = `unavailable (${String(error)})`; }
  throw new Error(`Native focus timeout (${name}): state=${JSON.stringify(state) ?? "unavailable"}, locked=${lock}. Unlock the Mac if locked; otherwise inspect native focus.`, { cause: lastError });
}
