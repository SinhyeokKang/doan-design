package cli

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
	"golang.org/x/sys/unix"
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
		return &Error{Code: "usage_error", Message: "Local storage requires a Git repository", NextSteps: []string{"Choose Include in Git (--storage repo), or use a Git repository"}}
	case "git_unreadable":
		return &Error{Code: "internal_error", Message: "Cannot read Git metadata for Doan storage", NextSteps: []string{"Make the repository Git metadata readable, then retry"}}
	case "exclude_unwritable":
		return &Error{Code: "internal_error", Message: "Cannot read or write the Git exclude file for Doan storage", NextSteps: []string{"Make the Git exclude file and its directory readable and writable, then retry"}}
	}
	return nil
}
func excludeFailure(err error) *Error {
	return &Error{Code: "internal_error", Message: "Cannot update the Git exclude file for Doan storage: " + err.Error(), NextSteps: []string{"Check Git metadata and exclude permissions, then retry"}}
}
func configStorage(ctx Context, root, storage string) (Outcome, *Error) {
	before := repo.ReadStorage(root, ctx.Home)
	if !(storage == "repo" && before.Reason == "not_git") {
		if failure := storageFailure(before); failure != nil {
			return Outcome{}, failure
		}
	}
	written := []string{}
	if storage == "repo" {
		changed, err := writeAttributes(root)
		if err != nil {
			return Outcome{}, &Error{Code: "internal_error", Message: "Cannot prepare .gitattributes for repo storage: " + err.Error(), NextSteps: []string{"Make .gitattributes writable inside the repository, then retry; the exclude pair was not removed"}}
		}
		if changed {
			written = append(written, ".gitattributes")
		}
	}
	if before.Reason != "not_git" {
		changed, err := repo.WriteStorage(root, ctx.Home, storage)
		if err != nil {
			return Outcome{}, excludeFailure(err)
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
	for _, line := range []string{".doan/comments/*.jsonl merge=union", ".doan/** linguist-documentation"} {
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
	info, err := os.Lstat(path)
	if err != nil && !os.IsNotExist(err) {
		return false, err
	}
	if info != nil && !info.Mode().IsRegular() {
		return false, errors.New(".gitattributes must be a regular file")
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
	suffix := ""
	if len(data) > 0 && data[len(data)-1] != '\n' {
		suffix = newline
	}
	suffix += strings.Join(missing, newline) + newline
	flags := unix.O_WRONLY | unix.O_APPEND | unix.O_NOFOLLOW | unix.O_NONBLOCK
	if info == nil {
		flags |= unix.O_CREAT | unix.O_EXCL
	}
	fd, err := unix.Open(path, flags, 0644)
	if errors.Is(err, unix.EEXIST) {
		return false, fmt.Errorf(".gitattributes was created concurrently; retry")
	}
	if err != nil {
		return false, err
	}
	file := os.NewFile(uintptr(fd), path)
	opened, err := file.Stat()
	if err != nil || !opened.Mode().IsRegular() || (info != nil && !os.SameFile(info, opened)) {
		file.Close()
		return false, errors.New(".gitattributes changed while opening")
	}
	_, err = file.WriteString(suffix)
	closeErr := file.Close()
	if err != nil {
		return false, err
	}
	return true, closeErr
}
