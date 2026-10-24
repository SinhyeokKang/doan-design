package repo

import (
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type GitInfo struct {
	Common    string   `json:"common"`
	Main      string   `json:"main,omitempty"`
	Branch    string   `json:"branch,omitempty"`
	Detached  string   `json:"detached,omitempty"`
	Worktrees []string `json:"worktrees"`
}

// Git metadata is optional: unreadable metadata must not prevent listing designs.
func ReadGit(root, home string) *GitInfo {
	root, ok := gitDirectory(root)
	if !ok {
		return nil
	}
	if home != "" {
		if canonical, ok := gitDirectory(home); ok {
			home = canonical
		} else {
			home = filepath.Clean(home)
		}
	}
	tree := root
	for {
		if ignoreAtOrAboveHome(tree, home) {
			return nil
		}
		_, err := os.Lstat(filepath.Join(tree, ".git"))
		if err == nil {
			break
		}
		if !os.IsNotExist(err) {
			return nil
		}
		parent := filepath.Dir(tree)
		if parent == tree {
			return nil
		}
		tree = parent
	}
	gitdir := filepath.Join(tree, ".git")
	// Follow a directory symlink only after choosing the nearest marker.
	info, err := os.Stat(gitdir)
	if err != nil {
		return nil
	}
	isFile := !info.IsDir()
	if isFile {
		if !info.Mode().IsRegular() {
			return nil
		}
		text, ok := readGitFile(gitdir)
		if !ok {
			return nil
		}
		target := parseGitFile(text)
		if target == "" {
			return nil
		}
		if !filepath.IsAbs(target) {
			target = filepath.Join(tree, target)
		}
		gitdir = target
	}
	gitdir, ok = gitDirectory(gitdir)
	if !ok {
		return nil
	}
	common := gitdir
	if isFile {
		path := filepath.Join(gitdir, "commondir")
		if _, err := os.Lstat(path); err == nil {
			text, ok := readGitFile(path)
			if !ok {
				return nil
			}
			common = parseCommondir(text, gitdir)
			if common == "" {
				return nil
			}
		} else if !os.IsNotExist(err) {
			return nil
		}
	}
	common, ok = gitDirectory(common)
	if !ok {
		return nil
	}
	headPath := filepath.Join(gitdir, "HEAD")
	headInfo, err := os.Lstat(headPath)
	if err != nil {
		return nil
	}
	var branch, detached string
	// Following a symbolic HEAD would mistake its branch's SHA for detached HEAD.
	if headInfo.Mode()&os.ModeSymlink == 0 {
		head, ok := readGitFile(headPath)
		if !ok {
			return nil
		}
		branch, detached = parseHead(head)
	}
	result := &GitInfo{Common: common, Branch: branch, Detached: detached}
	rel, err := filepath.Rel(tree, root)
	if err != nil || outside(rel) {
		return nil
	}
	roots := []string{tree}
	parent := filepath.Dir(common)
	parentGit, same := gitDirectory(filepath.Join(parent, ".git"))
	if isMainWorktree(common, same && parentGit == common) {
		roots = append(roots, parent)
		if mapped, ok := gitDirectory(filepath.Join(parent, rel)); ok {
			result.Main = mapped
		}
	}
	entries, ok := readWorktreeGitdirs(common)
	if !ok {
		roots = []string{tree}
	}
	for _, path := range worktreeGitdirs(entries) {
		// The backlink itself must still exist; stale registrations are prunable.
		info, err := os.Stat(path)
		if err != nil || !info.Mode().IsRegular() {
			continue
		}
		roots = append(roots, filepath.Dir(path))
	}
	paths := map[string]bool{root: true}
	for _, candidate := range mapWorktrees(roots, rel) {
		if path, ok := gitDirectory(candidate); ok {
			paths[path] = true
		}
	}
	result.Worktrees = sortedGitPaths(paths)
	if len(result.Worktrees) > gitWorktreeLimit {
		// Keep the selected root even when its byte order falls beyond the limit.
		result.Worktrees = result.Worktrees[:gitWorktreeLimit]
		present := false
		for _, path := range result.Worktrees {
			if path == root {
				present = true
				break
			}
		}
		if !present {
			result.Worktrees[len(result.Worktrees)-1] = root
			sort.Strings(result.Worktrees)
		}
	}
	return result
}

func gitDirectory(path string) (string, bool) {
	if !filepath.IsAbs(path) {
		return "", false
	}
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", false
	}
	info, err := os.Stat(resolved)
	if err != nil || !info.IsDir() {
		return "", false
	}
	volume := filepath.VolumeName(resolved) + string(filepath.Separator)
	spelling, err := diskSpelling(volume, strings.TrimPrefix(resolved, volume))
	if err != nil {
		return "", false
	}
	return filepath.Join(volume, spelling), true
}

func readGitFile(path string) (string, bool) {
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() || info.Size() > gitFileLimit {
		return "", false
	}
	f, err := os.Open(path)
	if err != nil {
		return "", false
	}
	data, readErr := io.ReadAll(io.LimitReader(f, gitFileLimit+1))
	closeErr := f.Close()
	if readErr != nil || closeErr != nil || len(data) > gitFileLimit {
		return "", false
	}
	return string(data), true
}

func readWorktreeGitdirs(common string) ([]worktreeGitdirEntry, bool) {
	path := filepath.Join(common, "worktrees")
	info, err := os.Stat(path)
	if os.IsNotExist(err) {
		return nil, true
	}
	if err != nil || !info.IsDir() {
		return nil, false
	}
	path, ok := gitDirectory(path)
	if !ok {
		return nil, false
	}
	dir, err := os.Open(path)
	if err != nil {
		return nil, false
	}
	entries, readErr := dir.ReadDir(gitWorktreeLimit)
	closeErr := dir.Close()
	if (readErr != nil && readErr != io.EOF) || closeErr != nil {
		return nil, false
	}
	result := make([]worktreeGitdirEntry, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		// ReadDir already gives disk-spelled directory names; re-normalizing each
		// base would rescan the entire registrations directory for every entry.
		base := filepath.Join(path, entry.Name())
		if text, ok := readGitFile(filepath.Join(base, "gitdir")); ok {
			result = append(result, worktreeGitdirEntry{base: base, text: text})
		}
	}
	return result, true
}
