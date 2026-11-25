import type { EditLines } from "../main/conversation/types";

export const stepCount = (n: number) => n === 1 ? "1 step" : `${n} steps`;

const NUMBER = new Intl.NumberFormat("en-US");
const linesAdded = (n: number) => `${NUMBER.format(n)} ${n === 1 ? "line" : "lines"} added`;

// name: a screen reader would read the signs of text as symbols.
export function editLinesLabel(lines: EditLines): { text: string; name: string } {
  return {
    text: `+${NUMBER.format(lines.added)} −${NUMBER.format(lines.removed)}`,
    name: `${linesAdded(lines.added)}, ${NUMBER.format(lines.removed)} removed`,
  };
}

export function editHeadName(steps: number, lines: EditLines | undefined): string {
  return lines ? `${stepCount(steps)}, ${editLinesLabel(lines).name}` : stepCount(steps);
}
