// Text an approval card shows comes from the agent. Bidi controls can reorder what the person reads against what runs,
// and zero-width, tag and other invisible code points can hide part of it, so each one reads as `<U+XXXX>`. Line feeds
// and tabs stay: commands span lines and the card keeps their layout. The Hangul fillers render blank although they
// are letters.
const INVISIBLE = /(?![\n\t])[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\u115F\u1160\u3164\uFFA0]/gu;
export function visibleText(text: string): string {
  return text.replace(INVISIBLE, char => `<U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}>`);
}
