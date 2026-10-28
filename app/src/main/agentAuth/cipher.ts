import { safeStorage } from "electron";
import type { Cipher } from "./storage";

// macOS keeps the key in the login Keychain item "<app name> Safe Storage"; availability is only known after app ready.
export const electronCipher: Cipher = {
  available: () => safeStorage.isEncryptionAvailable(),
  encrypt: text => safeStorage.encryptString(text),
  decrypt: data => safeStorage.decryptString(data),
};
