import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { ProjectForm } from "./onboardingView";
import { ProjectFields, ProjectSetupDialog, setupRequest, type StorageInput } from "./ProjectSetupDialog";

// Draft canvas local-doan-files frame setup-dialog: a "Doan files" field between Token CSS and Will add; the list
// follows it.
const form: ProjectForm = { running: false, token: null, error: null, rerooted: null };
const fields = (storage: Partial<StorageInput>, over: Partial<typeof form> = {}, root = "/Users/ada/code/plain") =>
  renderToStaticMarkup(<ProjectFields root={root} form={{ ...form, ...over }} choose={() => {}} storage={{ value: "repo", kept: false, notGit: false, change: () => {}, ...storage }} />);

test("Include in Git is the default and Will add lists .gitattributes", () => {
  const html = fields({});
  expect(html).toContain('<div class="ob-field storage-field"><span class="ob-label" id="setup-storage-label">Doan files</span><div class="storage-options" role="radiogroup" aria-labelledby="setup-storage-label">');
  expect(html).toContain('<label class="storage-option"><input type="radio" name="setup-storage" checked=""/><span class="ob-radio" aria-hidden="true"></span><strong>Include in Git</strong><small>Git tracks these files. Commit them so your team gets your canvases and settings.</small></label>');
  expect(html).toContain("<span><code>.gitattributes</code> — one line, if missing</span>");
  expect(html.indexOf("Token CSS")).toBeLessThan(html.indexOf("Doan files"));
  expect(html.indexOf("Doan files")).toBeLessThan(html.indexOf("Will add"));
});

test("Keep out of Git lists the exclude entry in place of .gitattributes", () => {
  const html = fields({ value: "local" });
  expect(html).toContain("<span><code>.git/info/exclude</code> — two lines, if missing</span>");
  expect(html).not.toContain(".gitattributes");
  expect(html.match(/<input type="radio" name="setup-storage"( checked="")?\/>/g)).toEqual(['<input type="radio" name="setup-storage"/>', '<input type="radio" name="setup-storage" checked=""/>']);
});

test("a project already kept out of Git shows the fact, not the options", () => {
  const html = fields({ kept: true });
  expect(html).toContain('<span class="storage-fact"><span class="value">Keep out of Git (this Mac only)</span><span class="ob-helper">This project already keeps its Doan files out of Git in every worktree. Change it in Project Settings.</span></span>');
  expect(html).not.toContain('type="radio"');
  expect(html).toContain("<code>.git/info/exclude</code>");
});

test("a refused local setup keeps Keep out of Git chosen and shows why", () => {
  const html = fields({ value: "local" }, { error: "This folder isn’t a Git repository, so Doan can’t keep its files out of Git. Choose Include in Git, or run git init here first." });
  expect(html).toContain('<input type="radio" name="setup-storage" checked=""/><span class="ob-radio" aria-hidden="true"></span><strong>Keep out of Git (this Mac only)</strong>');
  expect(html).toContain('role="alert"');
  expect(html).toContain("Choose Include in Git, or run <code>git init</code> here first.");
  expect(fields({}, { running: true })).toContain('<input type="radio" disabled="" name="setup-storage" checked=""/>');
});

// design-sync (draft frame setup-dialog, 'Not a Git repository'): the command in the refusal is a code chip.
test("the refusal's git init is a code chip", () => {
  const html = fields({ value: "local" }, { error: "This folder isn’t a Git repository, so Doan can’t keep its files out of Git. Choose Include in Git, or run git init here first." });
  expect(html).toContain("<span>This folder isn’t a Git repository, so Doan can’t keep its files out of Git. Choose Include in Git, or run <code>git init</code> here first.</span>");
});

// Draft frame setup-dialog, '.git/info/exclude couldn’t be written': the fixed path is a code chip.
test("the exclude failure's path is a code chip", () => {
  const html = fields({ value: "local" }, { error: "Couldn’t add Doan’s lines to .git/info/exclude, so nothing was set up. Make sure the repository’s Git metadata and its exclude file can be read and written, then try again." });
  expect(html).toContain("<span>Couldn’t add Doan’s lines to <code>.git/info/exclude</code>, so nothing was set up. Make sure the repository’s Git metadata and its exclude file can be read and written, then try again.</span>");
});

// Read-only text is selectable (the `selectable` class); buttons and the title are not.
test("selectable: the refusal message and the token path, but not the None placeholder or the Choose button", () => {
  const html = fields({ value: "local" }, { error: "This folder isn’t a Git repository, so Doan can’t keep its files out of Git. Choose Include in Git, or run git init here first.", token: "/w/tokens.css" });
  expect(html).toMatch(/<span class="ob-msg error ob-wide selectable" role="alert">/);
  expect(html).toMatch(/<span class="value token-path selectable"/);
  expect(html).not.toMatch(/<button[^>]*selectable/);
  expect(fields({})).toContain('<span class="value none">None</span>');
});

test("selectable: the dialog's project path, but not its title or buttons", () => {
  const html = renderToStaticMarkup(<ProjectSetupDialog root="/Users/ada/code/studio" name="studio" onClose={() => {}} onRerooted={() => {}} />);
  expect(html).toMatch(/<p class="doan-dialog-description ob-project-path selectable"[^>]*>\/Users\/ada\/code\/studio<\/p>/);
  expect(html).not.toMatch(/<h3[^>]*selectable/);
  expect(html).not.toMatch(/<button[^>]*selectable/);
});

// Draft keep-out-git-init, frame setup-form: outside Git, Keep out of Git also creates the repository, so Will add says
// so first, and Set Up names the list for a screen reader.
test("outside Git, Keep out of Git adds the new repository at the top of Will add", () => {
  const html = fields({ value: "local", notGit: true });
  expect(html).toContain('<span class="ob-changes" id="setup-changes"><span><code>.git/</code> — a new Git repository</span><span><code>.doan/canvases/</code></span><span><code>.doan/config.json</code></span><span><code>.git/info/exclude</code> — two lines, if missing</span></span>');
  // Include in Git never creates one, and a project already kept out of Git sets up as it is.
  for (const storage of [{ value: "repo" as const, notGit: true }, { value: "local" as const, notGit: false }, { kept: true, notGit: true }]) {
    expect(fields(storage), JSON.stringify(storage)).not.toContain("a new Git repository");
  }
});

test("Set Up Project is described by Will add", () => {
  const html = renderToStaticMarkup(<ProjectSetupDialog root="/Users/ada/code/studio" name="studio" notGit onClose={() => {}} onRerooted={() => {}} />);
  expect(html).toMatch(/<button type="button" class="btn primary doan-button" data-ui-variant="prominent" aria-describedby="setup-changes">Set Up Project<\/button>/);
});

// --git-init is the consent to the .git/ line on screen: only with Keep out of Git, outside Git, and not for a project
// already kept out of Git (which runs plain init).
test("the setup request asks for the repository only when the form showed it", () => {
  expect(setupRequest("/w/a", null, "local", false, true)).toEqual({ root: "/w/a", choiceId: null, storage: "local", gitInit: true });
  expect(setupRequest("/w/a", "c1", "local", false, false)).toEqual({ root: "/w/a", choiceId: "c1", storage: "local" });
  expect(setupRequest("/w/a", null, "repo", false, true)).toEqual({ root: "/w/a", choiceId: null, storage: null });
  expect(setupRequest("/w/a", null, "local", true, true)).toEqual({ root: "/w/a", choiceId: null, storage: null });
});

// The form's own words for a failed creation (main's initOutcome): the command and the .git it left read as code.
test("a failed creation shows its command and the .git it left as code chips", () => {
  const missing = fields({ value: "local", notGit: true }, { error: "Git isn’t installed, so Doan can’t create a repository here. Install the Command Line Tools with xcode-select --install, then try again, or choose Include in Git." });
  expect(missing).toContain("Install the Command Line Tools with <code>xcode-select --install</code>, then try again, or choose Include in Git.");
  const left = fields({ value: "local" }, { error: "Setup failed, and Doan couldn’t remove the Git repository it created at /Users/ada/a b/new/.git. Remove it or keep it, then try again." }, "/Users/ada/a b/new");
  expect(left).toContain("it created at <code>/Users/ada/a b/new/.git</code>. Remove it or keep it, then try again.");
});
