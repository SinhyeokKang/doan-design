import type { Cipher } from "../storage";

// Reversible but not plaintext, so a test can tell an encrypted vault from a leaked copy.
export function fakeCipher(over: Partial<Cipher> = {}): Cipher {
  return {
    available: async () => true,
    encrypt: async text => Buffer.from("ENC:" + Buffer.from(text, "utf8").toString("base64")),
    decrypt: async data => { const text = data.toString("utf8"); if (!text.startsWith("ENC:")) throw new Error("bad key"); return Buffer.from(text.slice(4), "base64").toString("utf8"); },
    ...over,
  };
}
