import type { FoldResult, LocatedEvent, ParseResult } from "./types";

// Batch B replaces these stubs after the shared fixtures establish the contract.
export function parseLines(_text: string): ParseResult {
  throw new Error("not implemented");
}

export function fold(_events: LocatedEvent[]): FoldResult {
  throw new Error("not implemented");
}
