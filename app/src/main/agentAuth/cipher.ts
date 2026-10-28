import { safeStorage } from "electron";
import type { Cipher } from "./storage";

// macOS keeps the key in the login Keychain item "<app name> Safe Storage"; availability is only known after app ready.
// Electron 45 deprecates the synchronous API. shouldReEncrypt is not acted on: every refresh re-encrypts anyway.
export const electronCipher: Cipher = {
  available: () => safeStorage.isAsyncEncryptionAvailable(),
  encrypt: text => safeStorage.encryptStringAsync(text),
  decrypt: async data => (await safeStorage.decryptStringAsync(data)).result,
};
