export function searchText(text: string): string {
  return text.toLowerCase().normalize("NFC");
}

export function queryTokens(query: string): string[] {
  return searchText(query).trim().split(/\s+/).filter(Boolean);
}

function isWordStart(field: string, at: number): boolean {
  // indexOf returns a UTF-16 offset. The preceding code point can span two code units.
  const previous = Array.from(field.slice(Math.max(0, at - 2), at)).at(-1) ?? "";
  return !/[\p{L}\p{N}]/u.test(previous);
}

export function tokenScore(fields: readonly string[], token: string): number {
  let score = 0;
  for (const field of fields) {
    if (field.startsWith(token)) return 3;
    let at = field.indexOf(token);
    if (at === -1) continue;
    score = Math.max(score, 1);
    while (at > 0) {
      if (isWordStart(field, at)) {
        score = 2;
        break;
      }
      at = field.indexOf(token, at + 1);
    }
  }
  return score;
}

// Where tokenScore's best match in one field starts: prefix, then word start, then first substring.
export function tokenStart(field: string, token: string): number {
  if (field.startsWith(token)) return 0;
  const first = field.indexOf(token);
  for (let at = first; at > 0; at = field.indexOf(token, at + 1)) {
    if (isWordStart(field, at)) return at;
  }
  return first;
}
