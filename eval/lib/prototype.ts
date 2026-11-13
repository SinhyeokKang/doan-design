import { commandWords, doanCommand, doanPositionals } from "./transcript.ts";

export interface PrototypeCall { path: string | undefined; frame: string | undefined; prototype: boolean; output: string | undefined }

export function prototypeCalls(commands: string[], command: "open" | "export"): PrototypeCall[] {
  return commands.flatMap(commandWords).filter(words => doanCommand(words) === command).map(words => {
    let frame: string | undefined, output: string | undefined, prototype = false;
    for (let i = 1; i < words.length; i++) {
      if (words[i] === "--") break;
      const match = words[i]!.match(/^--?([^=]+)(?:=(.*))?$/);
      if (!match) continue;
      const [, name, inline] = match;
      if (name === "prototype") prototype = inline === undefined || /^(1|t|T|true|TRUE|True)$/.test(inline);
      else if (["repo", "token-css", "add-serve", "remove-serve", "frame", "message", "o"].includes(name!)) {
        const value = inline ?? words[++i];
        if (name === "frame") frame = value;
        if (name === "o") output = value;
      }
    }
    return { path: doanPositionals(words)?.[1], frame, prototype, output };
  });
}
