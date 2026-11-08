import { describe, expect, it } from "vitest";
import {
  checkLatestMacYml,
  checkReleaseVersion,
  compareEntitlements,
  parseCodesignDetails,
  parseSpctl,
} from "./releaseChecks.mjs";

// Real `codesign -dv --verbose=4` output of a notarized tester build (2026-11-06).
const signedApp = `Executable=/Applications/Doan.app/Contents/MacOS/Doan
Identifier=design.doan.app
Format=app bundle with Mach-O thin (arm64)
CodeDirectory v=20500 size=443 flags=0x10000(runtime) hashes=3+7 location=embedded
VersionPlatform=1
Hash type=sha256 size=32
CDHash=74241c3a6f0440a7476a6bce4db3a6542676bc33
Signature size=9047
Authority=Developer ID Application: Sinhyeok Kang (7H4HNHTB45)
Authority=Developer ID Certification Authority
Authority=Apple Root CA
Timestamp=Nov 6, 2026 at 16:03:47
Notarization Ticket=stapled
Info.plist entries=33
TeamIdentifier=7H4HNHTB45
Runtime Version=26.5.0
Sealed Resources version=2 rules=13 files=183
Internal requirements count=1 size=176
`;

// Real output for a linker-signed (ad-hoc) binary, what an unsigned local package carries.
const adhocBinary = `Executable=/tmp/adhoc
Identifier=adhoc
Format=Mach-O thin (arm64)
CodeDirectory v=20400 size=254 flags=0x20002(adhoc,linker-signed) hashes=5+0 location=embedded
Hash type=sha256 size=32
CDHash=2b54b0bcd475e39a6a9e9ec0c0e93a8418623c77
Signature=adhoc
Info.plist=not bound
TeamIdentifier=not set
Sealed Resources=none
Internal requirements=none
`;

const committedEntitlements = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
</dict>
</plist>
`;

// Real `codesign -d --entitlements - --xml` output of the tester build's app.
const signedEntitlements =
  '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>com.apple.security.cs.allow-jit</key><true/><key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/></dict></plist>';

describe("checkReleaseVersion", () => {
  const published = (tagName, isPrerelease = false) => ({ tagName, isDraft: false, isPrerelease });
  const draft = (tagName, isPrerelease = false) => ({ tagName, isDraft: true, isPrerelease });
  const check = (version, { packageVersion, tags = [], releases = [] } = {}) =>
    checkReleaseVersion({ version, packageVersion, tags, releases });

  it("accepts the first rc with nothing released", () => {
    expect(check("0.1.0-rc.1")).toEqual({ ok: true });
  });

  it.each(["0.1", "v0.1.0", "0.1.0-beta.1", "01.0.0", "0.1.0-rc.01", "0.1.0-rc"])(
    "rejects %s as bad_semver",
    (version) => {
      expect(check(version)).toMatchObject({ ok: false, code: "bad_semver" });
    },
  );

  it("rejects a tag that does not match the packaged version", () => {
    expect(check("0.1.0-rc.1", { packageVersion: "0.1.0" })).toMatchObject({ ok: false, code: "tag_mismatch" });
    expect(check("0.1.0-rc.1", { packageVersion: "0.1.0-rc.1" })).toEqual({ ok: true });
  });

  it("accepts its own tag when no release exists yet, so a rerun after a failed build passes", () => {
    expect(check("0.1.0-rc.1", { tags: ["v0.1.0-rc.1"] })).toEqual({ ok: true });
  });

  it("rejects a draft or a published release of the same version", () => {
    expect(check("0.1.0-rc.2", { tags: ["v0.1.0-rc.1", "v0.1.0-rc.2"], releases: [draft("v0.1.0-rc.2", true)] }))
      .toMatchObject({ ok: false, code: "draft_exists" });
    expect(check("0.1.0", { tags: ["v0.1.0"], releases: [published("v0.1.0")] }))
      .toMatchObject({ ok: false, code: "published_exists" });
  });

  it("orders rcs of the same base numerically", () => {
    const tags = ["v0.1.0-rc.1", "v0.1.0-rc.2", "v0.1.0-rc.9"];
    expect(check("0.1.0-rc.10", { tags })).toEqual({ ok: true });
    expect(check("0.1.0-rc.3", { tags })).toMatchObject({ ok: false, code: "not_newer" });
  });

  it("accepts the stable version after its rcs", () => {
    expect(check("0.1.0", { tags: ["v0.1.0-rc.1", "v0.1.0-rc.2"], releases: [published("v0.1.0-rc.2", true)] }))
      .toEqual({ ok: true });
  });

  it("rejects an rc of a version already published", () => {
    expect(check("0.1.0-rc.3", { tags: ["v0.1.0-rc.2", "v0.1.0"], releases: [published("v0.1.0")] }))
      .toMatchObject({ ok: false, code: "not_newer" });
  });

  it("rejects a version below the latest published stable", () => {
    expect(check("0.1.1", { tags: ["v0.1.2"], releases: [published("v0.1.2")] }))
      .toMatchObject({ ok: false, code: "not_newer" });
  });

  it("accepts a hotfix patch while a higher rc is out", () => {
    const releases = [published("v0.1.0"), published("v0.2.0-rc.1", true)];
    expect(check("0.1.1", { tags: ["v0.1.0", "v0.2.0-rc.1"], releases })).toEqual({ ok: true });
  });

  it("compares rcs only within their base", () => {
    expect(check("0.2.0-rc.1", { tags: ["v0.1.1-rc.5"] })).toEqual({ ok: true });
  });
});

describe("parseCodesignDetails", () => {
  it("reads authorities, the runtime flag, the secure timestamp and the Team ID", () => {
    expect(parseCodesignDetails(signedApp)).toEqual({
      authorities: [
        "Developer ID Application: Sinhyeok Kang (7H4HNHTB45)",
        "Developer ID Certification Authority",
        "Apple Root CA",
      ],
      runtime: true,
      timestamp: true,
      teamId: "7H4HNHTB45",
    });
  });

  it("reports an ad-hoc signature as unsigned by any authority", () => {
    expect(parseCodesignDetails(adhocBinary)).toEqual({
      authorities: [],
      runtime: false,
      timestamp: false,
      teamId: null,
    });
  });

  it("does not take a local signing time for a secure timestamp", () => {
    const local = signedApp.replace("Timestamp=Nov 6, 2026 at 16:03:47", "Signed Time=Nov 6, 2026 at 16:03:47");
    expect(parseCodesignDetails(local).timestamp).toBe(false);
  });
});

describe("compareEntitlements", () => {
  it("finds nothing extra when the signed entitlements match the committed plist", () => {
    expect(compareEntitlements(committedEntitlements, signedEntitlements)).toEqual([]);
  });

  it("finds disable-library-validation from electron-builder's fallback template", () => {
    const fallback = signedEntitlements.replace(
      "</dict>",
      "<key>com.apple.security.cs.disable-library-validation</key><true/></dict>",
    );
    expect(compareEntitlements(committedEntitlements, fallback)).toEqual([
      "com.apple.security.cs.disable-library-validation",
    ]);
  });

  it("treats a binary without entitlements as matching", () => {
    expect(compareEntitlements(committedEntitlements, "")).toEqual([]);
  });
});

describe("parseSpctl", () => {
  it("accepts a notarized Developer ID app", () => {
    const text = `/Applications/Doan.app: accepted
source=Notarized Developer ID
origin=Developer ID Application: Sinhyeok Kang (7H4HNHTB45)
`;
    expect(parseSpctl(text)).toEqual({ accepted: true, notarizedDeveloperId: true });
  });

  it("rejects an ad-hoc binary", () => {
    expect(parseSpctl("adhoc: rejected\n")).toEqual({ accepted: false, notarizedDeveloperId: false });
  });

  it("does not count an unnotarized Developer ID source", () => {
    expect(parseSpctl("Doan.app: rejected\nsource=Unnotarized Developer ID\n")).toEqual({
      accepted: false,
      notarizedDeveloperId: false,
    });
  });
});

describe("checkLatestMacYml", () => {
  // Shape of electron-builder 26's latest-mac.yml; values are made up.
  const yml = `version: 0.1.0-rc.1
files:
  - url: Doan-0.1.0-rc.1-arm64-mac.zip
    sha512: zipHash==
    size: 100
  - url: Doan-macos-arm64.dmg
    sha512: dmgHashBeforeStapling==
    size: 200
path: Doan-0.1.0-rc.1-arm64-mac.zip
sha512: zipHash==
releaseDate: '2026-11-08T00:00:00.000Z'
`;
  const zip = { version: "0.1.0-rc.1", zipName: "Doan-0.1.0-rc.1-arm64-mac.zip", zipSha512: "zipHash==" };

  it("accepts a feed whose zip entry matches, ignoring the dmg entry whose hash predates stapling", () => {
    expect(checkLatestMacYml(yml, zip)).toEqual({ ok: true });
  });

  it("rejects a zip hash mismatch", () => {
    expect(checkLatestMacYml(yml, { ...zip, zipSha512: "other==" })).toMatchObject({
      ok: false,
      code: "yml_sha512_mismatch",
    });
  });

  it("rejects a feed without the zip", () => {
    expect(checkLatestMacYml(yml, { ...zip, zipName: "Doan-0.1.0-arm64-mac.zip" })).toMatchObject({
      ok: false,
      code: "yml_missing_zip",
    });
  });

  it("rejects a feed for another version", () => {
    expect(checkLatestMacYml(yml, { ...zip, version: "0.1.0" })).toMatchObject({
      ok: false,
      code: "yml_version_mismatch",
    });
  });
});
