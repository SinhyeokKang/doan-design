import type { EditLines } from "../main/conversation/types";
import { stepCount } from "./threadItems";

const NUMBER = new Intl.NumberFormat("en-US");
const linesAdded = (n: number) => `${NUMBER.format(n)} ${n === 1 ? "line" : "lines"} added`;

// text is what the step and head show (U+2212 for the minus, zero kept); name is what a screen reader reads for it,
// since it would read the signs as symbols.
export function editLinesLabel(lines: EditLines): { text: string; name: string } {
  return {
    text: `+${NUMBER.format(lines.added)} −${NUMBER.format(lines.removed)}`,
    name: `${linesAdded(lines.added)}, ${NUMBER.format(lines.removed)} removed`,
  };
}

// The collapsed head's accessible name; a row without line counts keeps the step count alone.
export function editHeadName(steps: number, lines: EditLines | undefined): string {
  return lines ? `${stepCount(steps)}, ${editLinesLabel(lines).name}` : stepCount(steps);
}
