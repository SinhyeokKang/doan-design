package repo

import (
	"bytes"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sys/unix"
)

const ExcludeLabel = ".git/info/exclude"
const excludeLimit = 1 << 20
const storageMarker = "# doan: local"

var errNotGit = errors.New("not a Git repository")
var errGitUnreadable = errors.New("cannot read Git metadata")

type StorageInfo struct {
	Storage string
	Reason  string
}

func StoragePattern(rel string) string {
	if rel == "." || rel == "" {
		return "/.doan/"
	}
	var b strings.Builder
	b.WriteByte('/')
	path := filepath.ToSlash(rel)
	for i := 0; i < len(path); i++ {
		r := path[i]
		if strings.ContainsRune("*?[\\! ", rune(r)) {
			b.WriteByte('\\')
		}
		b.WriteByte(r)
	}
	b.WriteString("/.doan/")
	return b.String()
}

func pairLines(data []byte, pattern string) ([]string, []bool) {
	lines := strings.SplitAfter(string(data), "\n")
	matched := make([]bool, len(lines))
	clean := func(s string) string { return strings.TrimSuffix(strings.TrimSuffix(s, "\n"), "\r") }
	for i := 0; i+1 < len(lines); i++ {
		if clean(lines[i]) == storageMarker && clean(lines[i+1]) == pattern {
			matched[i] = true
			matched[i+1] = true
			i++
		}
	}
	return lines, matched
}
func HasStoragePair(data []byte, pattern string) bool {
	_, matched := pairLines(data, pattern)
	for _, m := range matched {
		if m {
			return true
		}
	}
	return false
}
func AddStoragePair(data []byte, pattern string) []byte {
	if HasStoragePair(data, pattern) {
		return data
	}
	newline := "\n"
	if bytes.Contains(data, []byte("\r\n")) {
		newline = "\r\n"
	}
	result := append([]byte{}, data...)
	if len(data) > 0 && data[len(data)-1] != '\n' {
		result = append(result, newline...)
	}
	return append(result, storageMarker+newline+pattern+newline...)
}
func RemoveStoragePair(data []byte, pattern string) []byte {
	lines, matched := pairLines(data, pattern)
	var result []byte
	for i, line := range lines {
		if !matched[i] {
			result = append(result, line...)
		}
	}
	return result
}

func readExclude(path string) ([]byte, os.FileInfo, error) {
	info, err := os.Lstat(path)
	if os.IsNotExist(err) {
		return nil, nil, nil
	}
	if err != nil {
		return nil, nil, err
	}
	if !info.Mode().IsRegular() || info.Size() > excludeLimit {
		return nil, nil, errors.New("exclude must be a regular file of at most 1 MiB")
	}
	fd, err := unix.Open(path, unix.O_RDONLY|unix.O_NOFOLLOW|unix.O_NONBLOCK, 0)
	if err != nil {
		return nil, nil, err
	}
	file := os.NewFile(uintptr(fd), path)
	defer file.Close()
	opened, err := file.Stat()
	if err != nil {
		return nil, nil, err
	}
	if !opened.Mode().IsRegular() || !os.SameFile(info, opened) {
		return nil, nil, errors.New("exclude changed while opening")
	}
	data, err := io.ReadAll(io.LimitReader(file, excludeLimit+1))
	if err != nil {
		return nil, nil, err
	}
	if len(data) > excludeLimit {
		return nil, nil, errors.New("exclude exceeds 1 MiB")
	}
	return data, opened, nil
}

// Mode inspection follows a final link as Git does; mutation still checks its own path.
func readExcludeMode(path string) ([]byte, os.FileInfo, error) {
	info, err := os.Lstat(path)
	if err == nil && info.Mode()&os.ModeSymlink != 0 {
		target, err := filepath.EvalSymlinks(path)
		if err != nil {
			return nil, nil, err
		}
		return readExclude(target)
	}
	return readExclude(path)
}

// A missing info directory is creatable only when its nearest existing parent is writable.
func excludeWritable(path string, info os.FileInfo) bool {
	if entry, err := os.Lstat(path); err == nil && entry.Mode()&os.ModeSymlink != 0 {
		return false
	}
	if info != nil && (info.Mode().Perm()&0222 == 0 || unix.Access(path, unix.W_OK) != nil) {
		return false
	}
	parent := filepath.Dir(path)
	for {
		st, err := os.Stat(parent)
		if err == nil {
			return st.IsDir() && st.Mode().Perm()&0222 != 0 && unix.Access(parent, unix.W_OK|unix.X_OK) == nil
		}
		if !os.IsNotExist(err) {
			return false
		}
		next := filepath.Dir(parent)
		if next == parent {
			return false
		}
		parent = next
	}
}

func ReadStorage(root, home string) StorageInfo {
	loc, err := gitLocation(root, home)
	if errors.Is(err, errNotGit) {
		return StorageInfo{"repo", "not_git"}
	}
	if err != nil {
		return StorageInfo{"unknown", "git_unreadable"}
	}
	if strings.ContainsAny(loc.rel, "\r\n") {
		return StorageInfo{"unknown", "exclude_unwritable"}
	}
	for _, dir := range []string{loc.gitdir, loc.common} {
		if unix.Access(dir, unix.R_OK|unix.X_OK) != nil {
			return StorageInfo{"unknown", "git_unreadable"}
		}
	}
	path := filepath.Join(loc.common, "info/exclude")
	data, info, err := readExcludeMode(path)
	if err != nil {
		return StorageInfo{"unknown", "exclude_unwritable"}
	}
	result := StorageInfo{Storage: "repo"}
	if HasStoragePair(data, StoragePattern(loc.rel)) {
		result.Storage = "local"
	}
	if !excludeWritable(path, info) || len(AddStoragePair(data, StoragePattern(loc.rel))) > excludeLimit {
		result.Reason = "exclude_unwritable"
	}
	return result
}
