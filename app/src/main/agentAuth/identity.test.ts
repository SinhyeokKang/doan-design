import { describe, expect, it } from "vitest";
import { codexAccountEmail, googleAccessToken, googleEmail, googleRefreshRequest, withIdentity } from "./identity";

// Shapes from Codex 0.164.0 app-server `account/read` (v2/GetAccountResponse.json; personal values replaced).
const chatgpt = { account: { type: "chatgpt", email: "ada@example.com", planType: "free" }, requiresOpenaiAuth: true };
// acp_token.json as the 1.3.0 server's _save_credentials writes it (values replaced).
const tokenFile = {
  client_id: "client.apps.googleusercontent.com", client_secret: "secret", refresh_token: "1//refresh", token_uri: "https://oauth2.googleapis.com/token",
  scopes: ["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/userinfo.email", "openid"], project_id: "p-1",
};

describe("codexAccountEmail", () => {
  it("reads the email of a ChatGPT account only", () => {
    expect(codexAccountEmail(chatgpt)).toBe("ada@example.com");
    expect(codexAccountEmail({ account: { type: "apiKey" }, requiresOpenaiAuth: true })).toBeUndefined();
    expect(codexAccountEmail({ account: { type: "amazonBedrock", email: "ada@example.com" }, requiresOpenaiAuth: true })).toBeUndefined();
    expect(codexAccountEmail({ account: null, requiresOpenaiAuth: true })).toBeUndefined();
    for (const reply of [null, "x", [], {}]) expect(codexAccountEmail(reply)).toBeUndefined();
  });
  it("refuses an email the account line would not show", () => {
    for (const email of ["", "a".repeat(513), "ada\0@example.com", 42, null]) {
      expect(codexAccountEmail({ account: { ...chatgpt.account, email } })).toBeUndefined();
    }
    expect(codexAccountEmail({ account: { ...chatgpt.account, email: "a".repeat(512) } })).toBe("a".repeat(512));
  });
});

describe("googleRefreshRequest", () => {
  it("builds a form-encoded refresh grant to Google's token address", () => {
    const request = googleRefreshRequest(tokenFile);
    expect(request?.url).toBe("https://oauth2.googleapis.com/token");
    expect(Object.fromEntries(new URLSearchParams(request!.body))).toEqual({
      grant_type: "refresh_token", client_id: tokenFile.client_id, client_secret: "secret", refresh_token: "1//refresh",
    });
  });
  it("encodes form metacharacters in the secret", () => {
    const request = googleRefreshRequest({ ...tokenFile, client_secret: "a+b&c=d e" })!;
    expect(request.body).toContain("client_secret=a%2Bb%26c%3Dd+e");
    expect(new URLSearchParams(request.body).get("client_secret")).toBe("a+b&c=d e");
  });
  it("refuses a file that is not a JSON object", () => {
    for (const file of [[tokenFile], null, "text", 42, undefined]) expect(googleRefreshRequest(file)).toBeNull();
  });
  it("sends nothing anywhere but Google's exact token address", () => {
    for (const token_uri of ["http://oauth2.googleapis.com/token", "https://evil.example/token", "https://oauth2.googleapis.com/other", "https://oauth2.googleapis.com/token/", undefined]) {
      expect(googleRefreshRequest({ ...tokenFile, token_uri })).toBeNull();
    }
  });
  it("requires the userinfo.email scope in a string array", () => {
    expect(googleRefreshRequest({ ...tokenFile, scopes: "https://www.googleapis.com/auth/userinfo.email" })).toBeNull();
    expect(googleRefreshRequest({ ...tokenFile, scopes: ["openid"] })).toBeNull();
    expect(googleRefreshRequest({ ...tokenFile, scopes: [7, "https://www.googleapis.com/auth/userinfo.email"] })).toBeNull();
    const { scopes: _, ...without } = tokenFile;
    expect(googleRefreshRequest(without)).toBeNull();
  });
  it("requires each credential field as a non-empty string", () => {
    for (const field of ["client_id", "client_secret", "refresh_token"] as const) {
      const { [field]: _, ...missing } = tokenFile;
      expect(googleRefreshRequest(missing)).toBeNull();
      expect(googleRefreshRequest({ ...tokenFile, [field]: 42 })).toBeNull();
      expect(googleRefreshRequest({ ...tokenFile, [field]: "" })).toBeNull();
    }
  });
});

describe("googleAccessToken", () => {
  it("takes the access token and reports a returned refresh token without its value", () => {
    expect(googleAccessToken({ access_token: "ya29.a", expires_in: 3599, token_type: "Bearer" })).toEqual({ token: "ya29.a", refreshTokenReturned: false });
    expect(googleAccessToken({ access_token: "ya29.a", refresh_token: "1//new" })).toEqual({ token: "ya29.a", refreshTokenReturned: true });
  });
  it("has no token without a usable access_token", () => {
    for (const reply of [{}, { access_token: "" }, { access_token: 42 }, null, [], "ya29.a"]) expect(googleAccessToken(reply).token).toBeNull();
    expect(googleAccessToken({ error: "invalid_grant", refresh_token: "1//new" })).toEqual({ token: null, refreshTokenReturned: true });
  });
});

describe("googleEmail", () => {
  it("reads the userinfo email unless Google says it is unverified", () => {
    expect(googleEmail({ sub: "1", email: "ada@example.com", email_verified: true })).toBe("ada@example.com");
    expect(googleEmail({ sub: "1", email: "ada@example.com" })).toBe("ada@example.com");
    expect(googleEmail({ sub: "1", email: "ada@example.com", email_verified: false })).toBeUndefined();
  });
  it("refuses a missing or unshowable email", () => {
    for (const reply of [{ sub: "1" }, { email: "" }, { email: "a".repeat(513) }, { email: "a\0b" }, null, [], "ada@example.com"]) expect(googleEmail(reply)).toBeUndefined();
  });
});

describe("withIdentity", () => {
  const account = { id: null, workspace: null, displayName: "Ada" };
  it("puts a found email on the status account", () => {
    expect(withIdentity(account, { email: "new@example.com" }, { id: null, workspace: null, email: "old@example.com" })).toEqual({ ...account, email: "new@example.com" });
  });
  it("keeps the previous email when the lookup found nothing", () => {
    expect(withIdentity(account, null, { id: null, workspace: null, email: "old@example.com" })).toEqual({ ...account, email: "old@example.com" });
  });
  it("has no email when nothing was found and there is no previous account", () => {
    expect(withIdentity(account, null, null)).toEqual(account);
    expect(withIdentity(account, null, { id: null, workspace: null })).toEqual(account);
  });
  it("takes id, workspace and display name from the status account only", () => {
    const status = { id: "s-id", workspace: "s-ws" };
    expect(withIdentity(status, null, { id: "p-id", workspace: "p-ws", displayName: "Prev", email: "old@example.com" })).toEqual({ ...status, email: "old@example.com" });
  });
});
