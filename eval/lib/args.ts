export type Agent = "claude" | "codex";
export const AGENTS: Agent[] = ["claude", "codex"];

export interface Options {
  scenarios: string[] | null;
  agents: Agent[];
  repeat: number;
  round: string;
  selfTest: boolean;
  judge: boolean;
}

// Ids and the round name become directory names under .scratch/agent-eval/.
const NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

function list(value: string | undefined, flag: string): string[] {
  if (value === undefined) throw new Error(`${flag} needs a value`);
  const items = value.split(",");
  if (items.some(item => !NAME.test(item) || item.includes(".."))) throw new Error(`${flag}: bad list ${JSON.stringify(value)}`);
  return items;
}

export function parseArgs(argv: string[], now: Date): Options {
  const pad = (n: number) => String(n).padStart(2, "0");
  const options: Options = {
    scenarios: null, agents: [...AGENTS], repeat: 1,
    round: `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
    selfTest: false, judge: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--self-test") options.selfTest = true;
    else if (flag === "--no-judge") options.judge = false;
    else if (flag === "--scenarios") options.scenarios = list(argv[++i], flag);
    else if (flag === "--agents") {
      const agents = list(argv[++i], flag);
      if (agents.some(agent => !(AGENTS as string[]).includes(agent))) throw new Error(`--agents: only ${AGENTS.join(", ")}`);
      options.agents = agents as Agent[];
    } else if (flag === "--repeat") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) throw new Error("--repeat needs a whole number of at least 1");
      options.repeat = n;
    } else if (flag === "--round") {
      const [round] = list(argv[++i], flag);
      if (argv[i].includes(",")) throw new Error("--round takes one name");
      options.round = round;
    } else throw new Error(`unknown argument ${JSON.stringify(flag)}`);
  }
  return options;
}
