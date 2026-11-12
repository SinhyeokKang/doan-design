package cli

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"strings"

	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
)

const localGuidance = "Doan files stay in this checkout on this Mac; they do not follow other worktrees or devices. Git worktree removal or git clean -x can delete them; use Export to share a canvas. Existing .gitattributes lines remain. If you previously committed .doan/, those files remain tracked. To stop tracking them, run `git rm -r --cached .doan` in this project folder, then commit. The staged deletions enter your next commit; teammates who pull it lose their .doan/ files. Doan does not run this command or commit."

func validateStorage(f Flags) *Error {
	if (f.Given["storage"] || f.Storage != "") && f.Storage != "local" && f.Storage != "repo" {
		return usageError("--storage must be local or repo")
	}
	return nil
}
func addStorageResult(result map[string]any, s repo.StorageInfo) {
	result["storage"] = s.Storage
	if s.Reason != "" {
		result["storageReason"] = s.Reason
	}
}
func storageFailure(s repo.StorageInfo) *Error {
	switch s.Reason {
	case "not_git":
		return &Error{Code: "local_not_git", Message: "Local storage requires a Git repository", NextSteps: []string{"Choose Include in Git (--storage repo), or use a Git repository", "Ask the user first; pass --git-init only when they agree to create a Git repository here"}}
	case "git_unreadable":
		return &Error{Code: "local_exclude_failed", Message: "Cannot read Git metadata for Doan storage", NextSteps: []string{"Make the repository Git metadata readable, then retry"}}
	case "exclude_unwritable":
		return &Error{Code: "local_exclude_failed", Message: "Cannot read or write the Git exclude file for Doan storage", NextSteps: []string{"Use a regular exclude file within 1 MiB, with readable and writable Git metadata, then retry"}}
	}
	return nil
}
func excludeFailure() *Error {
	return &Error{Code: "local_exclude_failed", Message: "Cannot update the Git exclude file for Doan storage", NextSteps: []string{"Check Git metadata and exclude permissions, then retry"}}
}
func configStorage(ctx Context, root string, f Flags) (out Outcome, failure *Error) {
	storage := f.Storage
	before := repo.ReadStorage(root, ctx.Home)
	written := []string{}
	create, failure := gitInitDecision(before, root, ctx.Home, f)
	if failure != nil {
		return Outcome{}, failure
	}
	if create {
		var claimed repo.ClaimedGit
		if claimed, failure = initGit(ctx, root); failure != nil {
			return Outcome{}, failure
		}
		defer func() { failure = rollbackGit(claimed, failure) }()
		written = append(written, ".git/")
		before = repo.ReadStorage(root, ctx.Home)
	}
	if before.Storage != storage && !(storage == "repo" && before.Reason == "not_git") {
		if failure := storageFailure(before); failure != nil {
			return Outcome{}, failure
		}
	}
	if storage == "repo" && before.Storage != storage {
		changed, err := writeAttributes(root)
		if err != nil {
			return Outcome{}, &Error{Code: "internal_error", Message: "Cannot prepare .gitattributes for repo storage", NextSteps: []string{"Make .gitattributes writable inside the repository, then retry; the exclude pair was not removed"}}
		}
		if changed {
			written = append(written, ".gitattributes")
		}
	}
	if before.Reason != "not_git" && before.Storage != storage {
		changed, err := repo.WriteStorage(root, ctx.Home, storage)
		if err != nil {
			return Outcome{}, excludeFailure()
		}
		if changed {
			written = append(written, repo.ExcludeLabel)
		}
	}
	result := map[string]any{"repo": root, "changed": len(written) > 0, "written": written}
	addStorageResult(result, repo.ReadStorage(root, ctx.Home))
	if storage == "local" {
		result["guidance"] = localGuidance
	} else {
		result["guidance"] = "Doan files now appear in git status; commit them to share them with your team."
	}
	return Outcome{Result: result}, nil
}
func missingAttributes(data []byte) []string {
	missing := []string{}
	for _, line := range []string{".doan/** linguist-documentation"} {
		found := false
		for _, s := range strings.Split(string(data), "\n") {
			if strings.TrimSuffix(s, "\r") == line {
				found = true
			}
		}
		if !found {
			missing = append(missing, line)
		}
	}
	return missing
}
func writeAttributes(root string) (bool, error) {
	state, _, err := repo.Resolve(root, root, ".gitattributes")
	if err != nil {
		return false, err
	}
	if state == repo.Outside {
		return false, errors.New(".gitattributes leaves repository")
	}
	path := filepath.Join(root, ".gitattributes")
	info, err := os.Stat(path)
	if err != nil && !os.IsNotExist(err) {
		return false, err
	}
	if info != nil && !info.Mode().IsRegular() {
		return false, errors.New(".gitattributes must be a regular file")
	}
	if info == nil {
		if _, err := os.Lstat(path); err == nil {
			return false, errors.New(".gitattributes is a dangling symlink")
		}
	}
	data, err := os.ReadFile(path)
	if err != nil && !os.IsNotExist(err) {
		return false, err
	}
	missing := missingAttributes(data)
	if len(missing) == 0 {
		return false, nil
	}
	newline := "\n"
	if bytes.Contains(data, []byte("\r\n")) {
		newline = "\r\n"
	}
	if len(data) > 0 && data[len(data)-1] != '\n' {
		data = append(data, newline...)
	}
	for _, line := range missing {
		data = append(data, line+newline...)
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		return false, err
	}
	return true, nil
}

// gitInitDecision says whether --storage local first creates a repository: only with --git-init, the user's
// agreement, and only in a folder in no repository below HOME (ReadStorage already ignores a .git at or above it).
func gitInitDecision(s repo.StorageInfo, root, home string, f Flags) (bool, *Error) {
	if !f.GitInit {
		return false, nil
	}
	if f.Storage != "local" {
		return false, usageError("--git-init needs --storage local")
	}
	if s.Reason != "not_git" {
		return false, nil
	}
	if repo.AtOrAboveHome(root, home) {
		return false, &Error{Code: "local_not_git", Message: "Doan doesn’t create a Git repository in your home folder or above it", NextSteps: []string{"Choose Include in Git (--storage repo), or set up a folder inside your home folder"}}
	}
	return true, nil
}

// notFoundStorageReason is ls's error.storageReason: the app plans the repository Keep out of Git would create
// from it, so it is set only for an existing folder in no repository.
func notFoundStorageReason(searched string, s repo.StorageInfo) string {
	if searched != "" && s.Reason == "not_git" {
		return "not_git"
	}
	return ""
}

// initGit runs the repository creation gitInitDecision allowed. Nothing is written on failure, except a .git
// that could not be removed, which cleanup_failed names.
func initGit(ctx Context, root string) (repo.ClaimedGit, *Error) {
	claimed, err := repo.InitGit(root, ctx.Home, ctx.Git)
	if err == nil {
		return claimed, nil
	}
	var failure *repo.GitInitError
	if !errors.As(err, &failure) {
		return repo.ClaimedGit{}, internal(err)
	}
	switch failure.Code {
	case "git_missing":
		return repo.ClaimedGit{}, &Error{Code: "git_missing", Message: "Git is not installed, so Doan cannot create a repository here", NextSteps: []string{"Ask the user to install the Command Line Tools (`xcode-select --install`), then retry; or choose Include in Git (--storage repo)"}}
	case "cleanup_failed":
		return repo.ClaimedGit{}, gitCleanupFailure(failure.Path)
	}
	return repo.ClaimedGit{}, &Error{Code: "git_init_failed", Message: "Could not create a Git repository here, so nothing was set up", NextSteps: []string{"Ask the user to check that the folder is writable and that git works, then retry; or choose Include in Git (--storage repo)"}}
}

func gitCleanupFailure(path string) *Error {
	return &Error{Code: "cleanup_failed", Message: "Setup failed, and Doan could not remove the Git repository it created at " + path, NextSteps: []string{"Ask the user to remove " + path + " or keep it, then retry"}}
}

// rollbackGit undoes this run's repository when a later step failed; only .git is undone, as other writes'
// failures leave what they wrote.
func rollbackGit(claimed repo.ClaimedGit, failure *Error) *Error {
	if failure == nil || claimed.Path == "" {
		return failure
	}
	if _, err := repo.RollbackGit(claimed); err != nil {
		return gitCleanupFailure(claimed.Path)
	}
	return failure
}
