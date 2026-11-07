// Pure checks behind checkReleaseVersion.mjs and verifySignedPackage.mjs. They take command
// output as text so CI, /release and /tester-build share one reading of it.

// Only x.y.z and x.y.z-rc.N exist; any other prerelease tag would sort unpredictably against rcs.
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.(0|[1-9]\d*))?$/;

function parseVersion(text) {
  const match = VERSION.exec(text);
  if (!match) return null;
  return { base: match.slice(1, 4).map(Number), rc: match[4] === undefined ? null : Number(match[4]) };
}

function compareBase(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a.base[i] !== b.base[i]) return a.base[i] - b.base[i];
  }
  return 0;
}

function compareVersions(a, b) {
  const base = compareBase(a, b);
  if (base !== 0) return base;
  if (a.rc === b.rc) return 0;
  // A stable version sorts above every rc of its base.
  if (a.rc === null) return 1;
  if (b.rc === null) return -1;
  return a.rc - b.rc;
}

function fail(code, message) {
  return { ok: false, code, message };
}

export function checkReleaseVersion({ version, packageVersion, tags = [], releases = [] }) {
  const parsed = parseVersion(version);
  if (!parsed) return fail("bad_semver", `${version} is not x.y.z or x.y.z-rc.N`);
  if (packageVersion !== undefined && packageVersion !== version) {
    return fail("tag_mismatch", `tag v${version} does not match app/package.json version ${packageVersion}`);
  }

  const tag = `v${version}`;
  const same = releases.filter((release) => release.tagName === tag);
  if (same.some((release) => !release.isDraft)) return fail("published_exists", `${tag} is already published`);
  if (same.some((release) => release.isDraft)) return fail("draft_exists", `a draft release for ${tag} exists`);

  const stable = releases
    .filter((release) => !release.isDraft && !release.isPrerelease)
    .map((release) => parseVersion(release.tagName.replace(/^v/, "")))
    .filter(Boolean);
  const latest = stable.reduce((max, next) => (max && compareVersions(max, next) >= 0 ? max : next), null);
  if (latest && compareVersions(parsed, latest) <= 0) {
    return fail("not_newer", `${version} is not newer than the latest published release v${latest.base.join(".")}`);
  }

  // Other tags of the same base: a rerun of this version's own tag is fine, an earlier rc is not.
  const sameBase = [...tags, ...releases.map((release) => release.tagName)]
    .filter((name) => name !== tag)
    .map((name) => parseVersion(name.replace(/^v/, "")))
    .filter((other) => other && compareBase(other, parsed) === 0);
  const higher = sameBase.find((other) => compareVersions(other, parsed) >= 0);
  if (higher) {
    const name = `v${higher.base.join(".")}${higher.rc === null ? "" : `-rc.${higher.rc}`}`;
    return fail("not_newer", `${version} is not newer than the existing tag ${name}`);
  }
  return { ok: true };
}

// Reads `codesign -dv --verbose=4` output.
export function parseCodesignDetails(text) {
  const authorities = [...text.matchAll(/^Authority=(.+)$/gm)].map((match) => match[1]);
  const flags = /^CodeDirectory .*flags=0x[0-9a-f]+\(([^)]*)\)/m.exec(text);
  const team = /^TeamIdentifier=(.+)$/m.exec(text);
  return {
    authorities,
    runtime: flags ? flags[1].split(",").includes("runtime") : false,
    // `Signed Time=` is the signer's clock, not a secure timestamp; notarization needs the latter.
    timestamp: /^Timestamp=/m.test(text),
    teamId: team && team[1] !== "not set" ? team[1] : null,
  };
}

function plistKeys(xml) {
  return [...xml.matchAll(/<key>([^<]+)<\/key>/g)].map((match) => match[1]);
}

// Keys signed into a binary that the committed plist does not grant.
export function compareEntitlements(committedPlist, signedXml) {
  const allowed = new Set(plistKeys(committedPlist));
  return [...new Set(plistKeys(signedXml))].filter((key) => !allowed.has(key));
}

// Reads `spctl -a -vv` output.
export function parseSpctl(text) {
  return {
    accepted: /: accepted$/m.test(text),
    notarizedDeveloperId: /^source=Notarized Developer ID$/m.test(text),
  };
}

function unquote(value) {
  return value.trim().replace(/^(['"])(.*)\1$/, "$2");
}

// Checks electron-builder's latest-mac.yml against the zip it describes. The dmg entry is ignored:
// its hash is taken before the dmg is stapled, and the macOS updater downloads only the zip.
export function checkLatestMacYml(ymlText, { version, zipName, zipSha512 }) {
  const feedVersion = /^version:\s*(.+)$/m.exec(ymlText);
  if (!feedVersion || unquote(feedVersion[1]) !== version) {
    return fail("yml_version_mismatch", `latest-mac.yml version is not ${version}`);
  }

  const entries = [];
  for (const line of ymlText.split("\n")) {
    const url = /^\s*-\s*url:\s*(.+)$/.exec(line);
    if (url) {
      entries.push({ url: unquote(url[1]), sha512: null });
      continue;
    }
    if (!/^\s/.test(line)) {
      entries.push(null);
      continue;
    }
    const sha = /^\s+sha512:\s*(.+)$/.exec(line);
    const current = entries.at(-1);
    if (sha && current) current.sha512 = unquote(sha[1]);
  }

  const entry = entries.find((candidate) => candidate && candidate.url === zipName);
  if (!entry) return fail("yml_missing_zip", `latest-mac.yml has no entry for ${zipName}`);
  if (entry.sha512 !== zipSha512) return fail("yml_sha512_mismatch", `latest-mac.yml sha512 for ${zipName} does not match the zip`);
  return { ok: true };
}
