// Usage: node app/scripts/verifySignedPackage.mjs <dmg> [<zip>]
// Checks a Developer ID signed, notarized and stapled Doan package the way a tester's Mac will see
// it. With a zip, also checks the app inside it and the latest-mac.yml next to it. Prints one line
// per check; exits 1 if any check fails.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, copyFileSync, existsSync, lstatSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { checkLatestMacYml, compareEntitlements, parseCodesignDetails, parseSpctl } from "./releaseChecks.mjs";

const committedEntitlements = readFileSync(new URL("../resources/entitlements.mac.plist", import.meta.url), "utf8");
const DEVELOPER_ID = "Developer ID Application: ";
const failures = [];

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function check(name, passed, detail = "") {
  if (passed) {
    console.log(`ok ${name}`);
  } else {
    failures.push(name);
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

function isMachO(path) {
  const fd = openSync(path, "r");
  try {
    const magic = Buffer.alloc(4);
    if (readSync(fd, magic, 0, 4, 0) < 4) return false;
    // Thin 64-bit Mach-O in either byte order, and universal (fat) binaries.
    return ["cffaedfe", "feedfacf", "cafebabe", "bebafeca"].includes(magic.toString("hex"));
  } finally {
    closeSync(fd);
  }
}

function machOFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = lstatSync(path);
    // Framework Versions/Current links point at files already walked.
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) found.push(...machOFiles(path));
    else if (stat.isFile() && isMachO(path)) found.push(path);
  }
  return found;
}

function checkSignatureDetails(label, path, { runtime }) {
  const details = parseCodesignDetails(run("codesign", ["-dv", "--verbose=4", path]).output);
  const developerId = details.authorities.some((authority) => authority.startsWith(DEVELOPER_ID));
  const problems = [
    !developerId && "no Developer ID Application authority",
    runtime && !details.runtime && "no runtime flag",
    !details.timestamp && "no secure timestamp",
  ].filter(Boolean);
  check(`signature ${label}`, problems.length === 0, problems.join(", "));
  return details.teamId;
}

function checkApp(label, app) {
  const verify = run("codesign", ["--verify", "--deep", "--strict", app]);
  check(`${label} codesign --verify --deep --strict`, verify.status === 0, verify.output.trim());

  const appTeam = checkSignatureDetails(`${label} Doan.app`, app, { runtime: true });
  const binaries = machOFiles(join(app, "Contents"));
  check(`${label} Mach-O files found`, binaries.length > 0);
  const otherTeams = new Set();
  for (const binary of binaries) {
    const team = checkSignatureDetails(`${label} ${binary.slice(app.length + 1)}`, binary, { runtime: true });
    if (team !== appTeam) otherTeams.add(String(team));
  }
  check(`${label} one Team ID`, appTeam !== null && otherTeams.size === 0, [...otherTeams].join(", "));

  // Non-main binaries fall back to electron-builder's template, which adds
  // disable-library-validation, when mac.entitlementsInherit is missing.
  const frameworks = join(app, "Contents", "Frameworks");
  const entitled = [
    app,
    ...readdirSync(frameworks).filter((name) => name.includes("Helper") && name.endsWith(".app")).map((name) => join(frameworks, name)),
    ...binaries.filter((path) => basename(path) === "spawn-helper"),
    join(app, "Contents", "Resources", "bin", "doan"),
  ];
  for (const path of entitled) {
    const signed = run("codesign", ["-d", "--entitlements", "-", "--xml", path]).output;
    const extra = compareEntitlements(committedEntitlements, signed.slice(signed.indexOf("<?xml")));
    const name = path === app ? "Doan.app" : path.slice(app.length + 1);
    check(`${label} entitlements ${name}`, extra.length === 0, extra.join(", "));
  }

  const requirement = run("codesign", ["-d", "-r-", app]).output;
  check(
    `${label} designated requirement`,
    appTeam !== null && requirement.includes(`certificate leaf[subject.OU] = "${appTeam}"`) && !requirement.includes("cdhash"),
    requirement.trim(),
  );

  const staple = run("xcrun", ["stapler", "validate", app]);
  check(`${label} stapler validate Doan.app`, staple.status === 0, staple.output.trim());

  const spctl = parseSpctl(run("spctl", ["-a", "-t", "exec", "-vv", app]).output);
  check(`${label} spctl exec`, spctl.accepted && spctl.notarizedDeveloperId);
}

function checkDmg(dmg, work) {
  checkSignatureDetails("dmg", dmg, { runtime: false });
  const staple = run("xcrun", ["stapler", "validate", dmg]);
  check("stapler validate dmg", staple.status === 0, staple.output.trim());

  // Gatekeeper judges a downloaded dmg by its quarantine flag; never skip this check, because
  // electron-builder silently leaves the dmg unsigned when it cannot find the identity.
  const copy = join(work, "quarantined.dmg");
  copyFileSync(dmg, copy);
  const quarantine = `0081;${Math.floor(Date.now() / 1000).toString(16)};Safari;`;
  run("xattr", ["-w", "com.apple.quarantine", quarantine, copy]);
  const spctl = parseSpctl(run("spctl", ["-a", "-t", "open", "--context", "context:primary-signature", "-v", copy]).output);
  check("spctl open dmg", spctl.accepted && spctl.notarizedDeveloperId);

  const mount = join(work, "mount");
  const attach = run("hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mount, copy]);
  check("hdiutil attach", attach.status === 0, attach.output.trim());
  if (attach.status !== 0) return;
  try {
    checkApp("dmg", join(mount, "Doan.app"));
  } finally {
    run("hdiutil", ["detach", mount]);
  }
}

function checkZip(zip, work) {
  const unpacked = join(work, "zip");
  const unzip = run("ditto", ["-x", "-k", zip, unpacked]);
  check("ditto -x -k zip", unzip.status === 0, unzip.output.trim());
  if (unzip.status === 0) checkApp("zip", join(unpacked, "Doan.app"));

  const ymlPath = join(dirname(zip), "latest-mac.yml");
  const version = /^Doan-(.+)-arm64-mac\.zip$/.exec(basename(zip));
  check("zip name Doan-<version>-arm64-mac.zip", version !== null, basename(zip));
  check("latest-mac.yml next to the zip", existsSync(ymlPath), ymlPath);
  if (version === null || !existsSync(ymlPath)) return;
  const zipSha512 = createHash("sha512").update(readFileSync(zip)).digest("base64");
  const feed = checkLatestMacYml(readFileSync(ymlPath, "utf8"), { version: version[1], zipName: basename(zip), zipSha512 });
  check("latest-mac.yml", feed.ok, feed.ok ? "" : `${feed.code}: ${feed.message}`);
}

const [dmgArg, zipArg, ...rest] = process.argv.slice(2);
if (!dmgArg || rest.length > 0) {
  console.error("usage: verifySignedPackage.mjs <dmg> [<zip>]");
  process.exit(2);
}

const work = mkdtempSync(join(tmpdir(), "doan-verify-"));
try {
  checkDmg(resolve(dmgArg), work);
  if (zipArg) checkZip(resolve(zipArg), work);
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`${failures.length} check(s) failed: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("all checks passed");
