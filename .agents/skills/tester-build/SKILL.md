---
name: tester-build
description: Build a Developer ID signed and notarized (app and dmg) tester dmg of Doan from the latest remote main and put it on the Desktop as Doan-tester-<date>-<sha>.dmg. Signs with the building machine's login keychain (Developer ID Application identity, notarytool profile doan-notary). Use when the user asks for a test or tester build, a dmg to install locally, or to share with a tester. Builds only; does not install, commit or push.
---

# Tester build

A local stand-in until release packaging exists (BACKLOG 'Release packaging'): arm64 only, built from the latest `origin/main`, signed with Developer ID under hardened runtime, with both the app and the dmg notarized and stapled. The credentials live in the building machine's login keychain: one `Developer ID Application` identity and the notarytool keychain profile `doan-notary`. `npm --prefix app run package` stays unsigned; signing happens only inside this skill, through command-line overrides, so no build setting changes. Everything happens in a temporary worktree.

**The dmg always goes to the Desktop (`~/Desktop`).** Never leave it in the repo, `.scratch/`, `app/dist/` or any other folder, even when asked for "a build" without a location.

**The human must be at the machine.** The first time codesign uses the private key, macOS asks "codesign wants to sign using key …"; the human clicks Always Allow. In a session where the keychain is locked (SSH and the like), codesign fails with `errSecInternalComponent`: stop and ask the human to unlock the keychain. In Codex, the keychain and the network are outside the sandbox, so request out-of-sandbox execution for every `security`, `notarytool`, electron-builder, `codesign`, `stapler` and `spctl` command (this path is unverified).

## One-time setup (the human does this; the agent never does)

When preflight finds credentials missing, report these steps for the human to follow.

**This machine**

1. Developer ID Application certificate: the Account Holder creates it in Xcode > Settings > Accounts > Manage Certificates (`+`), or uploads a Keychain Access CSR at developer.apple.com. The private key lands in the login keychain of the machine that made the CSR.
2. Export the certificate together with its private key as a `.p12` with a strong password. Keep the `.p12` as the backup (it is also how another machine gets the identity) and the password in the password manager. The certificate is valid for five years; renewal creates a second identity with the same name (see Preflight).
3. Notarization credential (App Store Connect API Team key): the first time, the Account Holder clicks Request Access in App Store Connect > Users and Access > Integrations; Team keys cannot be created before that. Then an Account Holder or Admin creates a Team key there with role Developer. The `.p8` downloads only once.
4. Store it: `! xcrun notarytool store-credentials doan-notary --key <.p8 path> --key-id <Key ID> --issuer <Issuer ID>`. It prints "Credentials validated" and "saved to Keychain"; the output holds the key path and IDs, not the key content.
5. Move the `.p8` content to the password manager and delete the file. The keychain profile holds the key, so notarization works without the file.

**Another machine**

1. Import the `.p12` (double-click, enter its password). Add the intermediate certificate if the identity is not valid (see below).
2. Recreate the profile: write the `.p8` content from the password manager to a temporary file, run the `store-credentials` command above against it, then delete the file.
3. Accept the Xcode license (`sudo xcodebuild -license accept`).
4. The login keychain's private key and notarytool profile are understood not to sync through iCloud Keychain; that is unverified, so set the machine up as above rather than expecting them to appear.

**Observations during setup**

- A `.cer` downloaded from the web alone left the identity invalid: `security find-identity -p codesigning` found the pair but reported "0 valid identities". Adding Apple's G2 intermediate `DeveloperIDG2CA.cer` (https://www.apple.com/certificateauthority/) to the login keychain made it valid.
- Without the Xcode license accepted, `xcrun notarytool` exits 69 and its output talks about the license. A missing profile also exits 69, but its output is "No Keychain password item found for profile". `sudo xcodebuild -license accept` asks for a password, so the human runs it in a terminal.
- App Store Connect does not allow Team keys until Request Access has been clicked.

## Preflight (before creating the worktree)

Stop at any failure, report what was found and what the human must do. Never fall back to an ad-hoc build: the report could no longer show whether the tester's dmg is notarized.

1. **Identity.** `security find-identity -v -p codesigning` must list exactly one `Developer ID Application:` line.
   - None: report the one-time setup. If `security find-identity -p codesigning` (without `-v`) shows the pair, report the G2 intermediate certificate hint.
   - Two or more (typically after renewal): stop and report each one's name, SHA-1 and expiry (`security find-certificate -Z -p -c "<name>" -a | openssl x509 -enddate -noout` per certificate; `-a` prints every match, so split the PEM blocks). The human deletes the old identity and replaces the `.p12` backup. Do not pick one: electron-builder passes only the identity name to codesign (`macPackager.js` `doSign`), and renewed identities share the name, so codesign fails as ambiguous.
   - From that line take `<Name> (<Team ID>)`, the part after `Developer ID Application: `, as this run's identity. Passing the prefix makes electron-builder throw `InvalidConfigurationError` (`codeSign/macCodeSign.js` `checkPrefix`).
2. **Profile.** `xcrun notarytool history --keychain-profile doan-notary` must exit 0. On failure, tell the cases apart by output: license text → the human runs `sudo xcodebuild -license accept`; "No Keychain password item found for profile" → the human runs the `store-credentials` setup step.
3. **Source and target.** `git fetch origin main`, note `sha=$(git rev-parse --short=7 origin/main)` and today's local date. If `~/Desktop/Doan-tester-<YYYY-MM-DD>-<sha>.dmg` exists, stop and ask instead of overwriting.

## Steps

1. **Worktree.** Add a temporary worktree at `origin/main` under `.scratch/tester-build/<sha>` (detached). Never build from a dirty or unpushed checkout.
2. **Setup** (AGENTS.md 'Commands'): in that worktree run `npm --prefix app ci`, then `node -e "require('electron')"` from `app/` once.
3. **Package**: `npm --prefix app run package`. It builds the versioned CLI (`app/build/bin/doan`) and `app/out/`, which the next step re-bundles. Its unsigned `app/dist` output is not used.
4. **Signed build and app notarization.** Make a fresh staging directory `<stage>` (absolute path). From `<worktree>/app` run exactly:
   ```
   env -u APPLE_ID -u APPLE_APP_SPECIFIC_PASSWORD -u APPLE_TEAM_ID -u APPLE_API_KEY -u APPLE_API_KEY_ID -u APPLE_API_ISSUER -u APPLE_KEYCHAIN -u CSC_LINK -u CSC_KEY_PASSWORD -u CSC_NAME -u CSC_IDENTITY_AUTO_DISCOVERY \
     APPLE_KEYCHAIN_PROFILE=doan-notary npx electron-builder --mac dmg --arm64 \
     -c.mac.identity="<Name> (<Team ID>)" -c.dmg.sign=true -c.directories.output=<stage>/out
   ```
   - The variables are unset because electron-builder prefers `APPLE_ID…` and `APPLE_API_KEY…` over the keychain profile (`MacTargetHelper.js` `getNotarizeOptions`), and a set `CSC_LINK` makes it sign from a temporary keychain (`macPackager.js`).
   - `--prepackaged` cannot be used: it skips signing (`macPackager.js` `packMacTargets`). electron-builder re-bundles `out/` with `build/bin/doan`, signs every binary under `Contents/` deepest first with hardened runtime, `--timestamp` and the committed entitlements, notarizes and staples the app, then builds the installer layout from `build.dmg` in `app/package.json` and signs the dmg.
   - `notarize` is left at its default, which notarizes when `APPLE_KEYCHAIN_PROFILE` is set and otherwise only warns and skips (`MacTargetHelper.js` `notarizeIfProvided`). So the output must contain "notarization successful"; if it does not, stop even though the build succeeded.
   - App notarization runs inside electron-builder, so it has no time limit. The app submission id is not printed: read it from the newest entry of `xcrun notarytool history --keychain-profile doan-notary`.
5. **Dmg notarization.** `xcrun notarytool submit <stage>/out/Doan-<version>-arm64.dmg --keychain-profile doan-notary --wait --timeout 30m`.
   - Not `Accepted`: report the issues from `xcrun notarytool log <id> --keychain-profile doan-notary` and stop.
   - Timeout: report the submission id and stop, keeping `<stage>` and the worktree. The next run resumes with `xcrun notarytool wait <id> --keychain-profile doan-notary` on that dmg instead of rebuilding.
   - `Accepted`: `xcrun stapler staple <dmg>`. If it fails, retry up to three times 30 seconds apart; if it still fails, stop and report. The app's ticket (stapled in step 4) covers a tester's first offline launch; the dmg's covers opening the dmg.
6. **Verify** (everything must pass before copying to the Desktop; otherwise stop and report). Make a quarantined copy of the stapled dmg inside `<stage>`: `xattr -w com.apple.quarantine "0081;$(printf '%x' "$(date +%s)");Safari;" <copy>`, mount it with `hdiutil attach -nobrowse -readonly <copy>`, and check the mounted `Doan.app` and the copy:
   - `codesign --verify --deep --strict <app>` passes.
   - Every Mach-O in the app (find files whose `file -b` says Mach-O: Electron framework and helpers, `Contents/Resources/bin/doan`, node-pty `pty.node` and `spawn-helper`) shows a `Developer ID Application:` authority, the `runtime` flag and a `Timestamp=` in `codesign -dv --verbose=4`.
   - `codesign -d --entitlements - --xml` of the app, each `Contents/Frameworks/*Helper*.app`, `spawn-helper` and `Contents/Resources/bin/doan` shows only the keys of the committed `app/resources/entitlements.mac.plist`, and no `disable-library-validation`. If `mac.entitlementsInherit` is missing, non-main binaries fall back to electron-builder's template with that key (`MacTargetHelper.js` `getOptionsForFile`); this check catches it.
   - `codesign -d -r- <app>` ties the designated requirement to the Developer ID of the Team ID (`certificate leaf[subject.OU] = "<Team ID>"`), not to a `cdhash`.
   - `codesign -dv --verbose=4 <dmg>` shows a `Developer ID Application:` authority and a `Timestamp=`.
   - `xcrun stapler validate` passes on the app and on the dmg.
   - `spctl -a -t exec -vv <mounted app>` and `spctl -a -t open --context context:primary-signature -v <quarantined copy>` both show `accepted` and `source=Notarized Developer ID`. Never skip the dmg check: `dmg.js` silently skips dmg signing when it cannot find the identity, and only this check catches that.
   - Detach the mount (`hdiutil detach`) when done.
7. **Copy.** Copy the stapled dmg (not the quarantined copy) to `~/Desktop/Doan-tester-<YYYY-MM-DD>-<sha>.dmg`.
8. **Clean up.** Remove the staging directory and the temporary worktree (`git worktree remove`), after checking it has no changes worth keeping.

## Report (Korean)

- The dmg path, the source sha and its commit subject, the identity name with Team ID, the app and dmg submission ids and their results, and the result of each verification check.
- How a tester installs it: drag to Applications and open; confirm once that it was downloaded from the internet. No Open Anyway and no `xattr`.
- A tester who used an earlier ad-hoc build may be asked again for `doan Safe Storage` keychain access (unverified).
- Opening the copy in `/Applications` runs Agent setup on the real HOME (ARCHITECTURE §7 'Agent setup'): `~/.local/bin/doan`, `~/.local/share/doan`, skill links, the Codex rule, and possibly an administrator dialog for `/usr/local/bin/doan`. The tester-side flow on another Mac is unverified.
- In Codex, whether signing and notarization ran outside the sandbox.

## Prohibited

- Do not read, print or write secrets (the `.p12` and its password, the `.p8`). Use only the profile name `doan-notary` and the identity name and SHA-1 the keychain shows.
- Do not fall back to an ad-hoc or unsigned build when credentials are missing or a step fails.
- Do not add or remove keychain identities or notarytool profiles; the human does that.
- Do not change `app/package.json` build settings or sign `npm --prefix app run package`.
- Do not install the app, open it, or touch the real HOME's agent setup targets; the user does that.
- Do not overwrite an existing dmg on the Desktop.
