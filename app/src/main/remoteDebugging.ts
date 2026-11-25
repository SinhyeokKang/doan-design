import type { CommandLine } from "electron";

// Fuses turn off Node's inspector but not Chromium's DevTools protocol switches; Chromium opens that server only after
// the main script starts, so exiting there keeps it closed. The unfused dev Electron keeps them.
const SWITCHES = ["remote-debugging-port", "remote-debugging-pipe"];

export function refusesRemoteDebugging(commandLine: Pick<CommandLine, "hasSwitch">, packaged: boolean): boolean {
  return packaged && SWITCHES.some((name) => commandLine.hasSwitch(name));
}
