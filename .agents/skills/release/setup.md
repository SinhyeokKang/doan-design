# One-time setup (the human)

> Part of the `/release` skill ([SKILL.md](SKILL.md)).

The human creates and renews the signing credentials; an agent never reads, prints or sets them.

**Environment.** Repository Settings → Environments → `release`: required reviewer = the maintainer; deployment refs = the tags `v*` (releases), `tester-*` (tester builds) and `release-dryrun-*` (release dry runs). Only the `sign` jobs use it. On a free account environments work only in public repositories.

**Secrets and variable** (in the `release` environment)

| Name | Kind | Value |
|---|---|---|
| `MAC_CERT_P12_BASE64` | secret | base64 of the `.p12` export of the Developer ID Application certificate with its private key |
| `MAC_CERT_PASSWORD` | secret | that `.p12`'s password |
| `APPLE_API_KEY_P8` | secret | the content of the App Store Connect API Team key's `.p8` file |
| `APPLE_API_KEY_ID` | secret | that key's Key ID (ten capitals or digits) |
| `APPLE_API_ISSUER` | secret | the Issuer ID (a UUID) |
| `MAC_IDENTITY_NAME` | variable | `<Name> (<Team ID>)`, the part after `Developer ID Application: ` in `security find-identity -v -p codesigning`; with the prefix electron-builder stops with `InvalidConfigurationError` |

**First setup**

1. Certificate: the Account Holder creates a Developer ID Application certificate in Xcode > Settings > Accounts > Manage Certificates (`+`), or uploads a Keychain Access CSR at developer.apple.com. The private key is created in the login keychain of the Mac that made the CSR.
2. In Keychain Access, export the certificate with its private key as a `.p12` with a strong password. Keep the `.p12` as a backup and the password in a password manager.
3. API key: the first time, the Account Holder presses Request Access under App Store Connect > Users and Access > Integrations (Team keys cannot be created before that). The Account Holder or an Admin creates a Team key with the Developer role. The `.p8` can be downloaded only once. The Issuer ID is shown above the Team keys list.
4. Set them, passing values on standard input or a prompt so they stay out of the screen and shell history, and with no quotes or spaces inside the values:
   ```
   base64 -i <cert.p12> | gh secret set MAC_CERT_P12_BASE64 --env release
   gh secret set MAC_CERT_PASSWORD --env release
   gh secret set APPLE_API_KEY_P8 --env release < <AuthKey_XXXX.p8>
   gh secret set APPLE_API_KEY_ID --env release
   gh secret set APPLE_API_ISSUER --env release
   gh variable set MAC_IDENTITY_NAME --env release --body '<Name> (<Team ID>)'
   ```
5. Move the `.p8` content into the password manager and delete the file.
6. Check with one `/tester-build`. The first `sign` step names any missing secret and the shape of a malformed one; wrong values fail at signing or notarization.

**Renewal**

- The certificate is valid for five years. After renewing, export a new `.p12` and replace `MAC_CERT_P12_BASE64` and `MAC_CERT_PASSWORD`. With the same name and Team ID `MAC_IDENTITY_NAME` stays; the Team ID must stay the same so installed copies keep their designated requirement (`certificate leaf[subject.OU]`).
- After revoking or replacing the API key, replace `APPLE_API_KEY_P8` and `APPLE_API_KEY_ID`; the Issuer ID belongs to the team and stays.
- Check again with one `/tester-build`.
