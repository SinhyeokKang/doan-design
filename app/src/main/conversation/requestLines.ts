export interface RequestPreset { id: string; title: string }
export interface RequestParts { preset: RequestPreset | null; skills: string[]; body: string }

export function requestLines(preset: RequestPreset | null, skills: readonly string[]): string[] {
  return [
    ...(preset ? [`Use the Doan design preset \`${preset.id}\` (${preset.title}).`] : []),
    ...[...new Set(skills)].map(name => `Use the project skill \`${name}\`.`),
  ];
}

// A whole paragraph must be fixed lines: a similar sentence in ordinary prose must not eat the next line.
function fixedBlock(paragraph: string): Omit<RequestParts, "body"> | null {
  const lines = paragraph.split("\n");
  let preset: RequestPreset | null = null;
  const skills: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const p = i === 0 ? /^Use the Doan design preset `([^`\n]+)` \(([^\n]*)\)\.$/.exec(line) : null;
    if (p) { preset = { id: p[1]!, title: p[2]! }; continue; }
    const skill = /^Use the project skill `([^`\n]+)`\.$/.exec(line);
    if (!skill) return null;
    if (!skills.includes(skill[1]!)) skills.push(skill[1]!);
  }
  return { preset, skills };
}

// combineQueued joins already-composed requests with a blank line, so display must inspect every paragraph.
function readRequest(text: string): { parts: RequestParts; titleText: string } {
  const paragraphs: string[] = [], skills = new Set<string>();
  let firstBlock = true, preset: RequestPreset | null = null, firstPresetTitle: string | null = null;
  for (const paragraph of text.split("\n\n")) {
    const block = fixedBlock(paragraph);
    if (!block) { paragraphs.push(paragraph); continue; }
    if (firstBlock) { preset = block.preset; firstBlock = false; }
    if (firstPresetTitle === null && block.preset) firstPresetTitle = block.preset.title;
    for (const name of block.skills) skills.add(name);
  }
  const body = paragraphs.join("\n\n");
  return { parts: { preset, skills: [...skills], body }, titleText: body.trim() ? body : firstPresetTitle ?? body };
}

export function splitRequestLines(text: string): RequestParts { return readRequest(text).parts; }
export function stripRequestLines(text: string): string { return splitRequestLines(text).body; }
export function requestTitleText(text: string): string { return readRequest(text).titleText; }
