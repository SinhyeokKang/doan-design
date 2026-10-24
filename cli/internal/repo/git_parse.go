package repo

import (
	"encoding/hex"
	"path/filepath"
	"sort"
	"strings"
)

const gitFileLimit = 4 * 1024
const gitWorktreeLimit = 200

func gitLine(text string) string {
	if len(text) > gitFileLimit {
		return ""
	}
	text = strings.TrimSuffix(text, "\n")
	text = strings.TrimSuffix(text, "\r")
	if strings.ContainsAny(text, "\r\n\x00") {
		return ""
	}
	return text
}

func parseGitFile(text string) string {
	line := gitLine(text)
	if !strings.HasPrefix(line, "gitdir: ") {
		return ""
	}
	return strings.TrimPrefix(line, "gitdir: ")
}

func parseHead(text string) (branch, detached string) {
	line := gitLine(text)
	if strings.HasPrefix(line, "ref: refs/heads/") {
		name := strings.TrimPrefix(line, "ref: refs/heads/")
		// Reftable's .invalid placeholder is not a branch name.
		if validBranchName(name) {
			return name, ""
		}
		return "", ""
	}
	if len(line) == 40 || len(line) == 64 {
		if _, err := hex.DecodeString(line); err == nil {
			return "", line
		}
	}
	return "", ""
}

func validBranchName(name string) bool {
	if name == "" || strings.Contains(name, "..") || strings.Contains(name, "@{") || strings.ContainsAny(name, " ~^:?*[\\") || strings.HasSuffix(name, ".") {
		return false
	}
	for _, c := range name {
		if c < 0x20 || c == 0x7f {
			return false
		}
	}
	for _, part := range strings.Split(name, "/") {
		if part == "" || strings.HasPrefix(part, ".") || strings.HasSuffix(part, ".lock") {
			return false
		}
	}
	return true
}

func parseCommondir(text, base string) string {
	path := gitLine(text)
	if path == "" {
		return ""
	}
	if filepath.IsAbs(path) {
		return filepath.Clean(path)
	}
	if !filepath.IsAbs(base) {
		return ""
	}
	return filepath.Join(base, path)
}

func isMainWorktree(common string, parentGitIsSameDir bool) bool {
	return filepath.IsAbs(common) && filepath.Base(common) == ".git" && parentGitIsSameDir
}

type worktreeGitdirEntry struct {
	base string
	text string
}

func worktreeGitdirs(entries []worktreeGitdirEntry) []string {
	paths := make(map[string]bool)
	if len(entries) > gitWorktreeLimit {
		entries = entries[:gitWorktreeLimit]
	}
	for _, entry := range entries {
		if strings.HasPrefix(gitLine(entry.text), "gitdir:") {
			continue
		}
		path := parseCommondir(entry.text, entry.base)
		if path != "" && filepath.Base(path) == ".git" {
			paths[path] = true
		}
	}
	return sortedGitPaths(paths)
}

func mapWorktrees(trees []string, rel string) []string {
	paths := make(map[string]bool)
	if filepath.IsAbs(rel) || strings.ContainsRune(rel, '\x00') || outside(filepath.Clean(rel)) {
		return []string{}
	}
	for _, tree := range trees {
		if filepath.IsAbs(tree) && !strings.ContainsRune(tree, '\x00') {
			paths[filepath.Join(tree, rel)] = true
		}
	}
	return sortedGitPaths(paths)
}

func sortedGitPaths(paths map[string]bool) []string {
	result := make([]string, 0, len(paths))
	for path := range paths {
		result = append(result, path)
	}
	sort.Strings(result)
	return result
}

func ignoreAtOrAboveHome(dir, home string) bool {
	if !filepath.IsAbs(dir) || !filepath.IsAbs(home) {
		return false
	}
	rel, err := filepath.Rel(dir, home)
	return err == nil && !outside(rel)
}
