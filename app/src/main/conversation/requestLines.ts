export interface RequestPreset { id: string; title: string }
export interface RequestParts { preset: RequestPreset | null; skills: string[]; body: string }

export function requestLines(preset: RequestPreset | null, skills: readonly string[]): string[] {
  return [
    ...(preset ? [`Use the Doan design preset \`${preset.id}\` (${preset.title}).`] : []),
    ...[...new Set(skills)].map(name => `Use the project skill \`${name}\`.`),
  ];
}

// A complete leading block is required: a similar sentence in ordinary prose must not eat the next line.
export function splitRequestLines(text: string): RequestParts {
  const plain: RequestParts = { preset: null, skills: [], body: text };
  const boundary = text.indexOf("\n\n");
  const lines = (boundary < 0 ? text : text.slice(0, boundary)).split("\n");
  let preset: RequestPreset | null = null;
  const skills: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const p = i === 0 ? /^Use the Doan design preset `([^`\n]+)` \(([^\n]*)\)\.$/.exec(line) : null;
    if (p) { preset = { id: p[1]!, title: p[2]! }; continue; }
    const skill = /^Use the project skill `([^`\n]+)`\.$/.exec(line);
    if (!skill) return plain;
    if (!skills.includes(skill[1]!)) skills.push(skill[1]!);
  }
  return { preset, skills, body: boundary < 0 ? "" : text.slice(boundary + 2) };
}

export function stripRequestLines(text: string): string { return splitRequestLines(text).body; }
