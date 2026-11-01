import { object } from "../conversation/sessions";
import { label } from "./providers";
import type { AccountIdentity } from "./types";

// The account email lookup for providers whose status shows no account (Codex, Antigravity). Every parser returns
// "nothing" rather than throwing: a lookup only adds an email to a result it never changes.
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
// The 1.3.0 server asks for this scope (_DEFAULT_SCOPES) and reads the email the same way (_fetch_account_email).
const EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email";

// Codex app-server `account/read`: only a ChatGPT account carries an email.
export function codexAccountEmail(reply: unknown): string | undefined {
  if (!object(reply) || !object(reply.account) || reply.account.type !== "chatgpt") return undefined;
  return label(reply.account.email);
}

// A refresh grant from the server's stored token file. token_uri must be Google's exact address so a changed file
// cannot send the client secret and refresh token anywhere else.
export function googleRefreshRequest(file: unknown): { url: string; body: string } | null {
  if (!object(file) || file.token_uri !== GOOGLE_TOKEN_URL) return null;
  if (!Array.isArray(file.scopes) || !file.scopes.every(scope => typeof scope === "string") || !file.scopes.includes(EMAIL_SCOPE)) return null;
  const { client_id, client_secret, refresh_token } = file;
  if (!filled(client_id) || !filled(client_secret) || !filled(refresh_token)) return null;
  return { url: GOOGLE_TOKEN_URL, body: new URLSearchParams({ grant_type: "refresh_token", client_id, client_secret, refresh_token }).toString() };
}

// A returned refresh token is reported, never kept: Doan does not rewrite the server's credential file.
export function googleAccessToken(reply: unknown): { token: string | null; refreshTokenReturned: boolean } {
  if (!object(reply)) return { token: null, refreshTokenReturned: false };
  return { token: filled(reply.access_token) ? reply.access_token : null, refreshTokenReturned: reply.refresh_token !== undefined && reply.refresh_token !== null };
}

export function googleEmail(reply: unknown): string | undefined {
  if (!object(reply) || reply.email_verified === false) return undefined;
  return label(reply.email);
}

// A failed lookup keeps the email already shown (previous); id, workspace and display name stay the status's own.
export function withIdentity(account: AccountIdentity, found: { email: string } | null, previous: AccountIdentity | null): AccountIdentity {
  const { email: _, ...status } = account;
  const email = found ? found.email : previous?.email;
  return { ...status, ...(email ? { email } : {}) };
}

const filled = (value: unknown): value is string => typeof value === "string" && value.length > 0;
