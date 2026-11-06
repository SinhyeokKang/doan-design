import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { ProjectForm } from "./onboardingView";
import { ProjectFields, type StorageInput } from "./ProjectSetupDialog";

// local-doan-files draft frame setup-dialog: a "Doan files" field between Token CSS and Will add; the list follows it.
const form: ProjectForm = { running: false, token: null, error: null, rerooted: null };
const fields = (storage: Partial<StorageInput>, over: Partial<typeof form> = {}) =>
  renderToStaticMarkup(<ProjectFields form={{ ...form, ...over }} choose={() => {}} storage={{ value: "repo", kept: false, change: () => {}, ...storage }} />);

test("Include in Git is the default and Will add lists .gitattributes", () => {
  const html = fields({});
  expect(html).toContain('<div class="ob-field storage-field"><span class="ob-label" id="setup-storage-label">Doan files</span><div class="storage-options" role="radiogroup" aria-labelledby="setup-storage-label">');
  expect(html).toContain('<label class="storage-option"><input type="radio" name="setup-storage" checked=""/><span class="ob-radio" aria-hidden="true"></span><strong>Include in Git</strong><small>Git tracks these files. Commit them so your team gets your canvases and settings.</small></label>');
  expect(html).toContain("<span><code>.gitattributes</code> — two lines, if missing</span>");
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
  expect(html).toContain("Choose Include in Git, or run git init here first.");
  expect(fields({}, { running: true })).toContain('<input type="radio" disabled="" name="setup-storage" checked=""/>');
});
