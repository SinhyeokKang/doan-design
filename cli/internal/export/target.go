package export

import (
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/text/unicode/norm"
)

// MatchListed turns the canvas argument of `doan export` into the path `doan ls`
// prints. arg is repo-relative or an absolute path into the repository; the
// directory part may go through links, but the file itself is looked up in the
// listing only, which never holds a link. Case and Unicode spelling may differ
// from the disk (macOS file systems treat them as the same name); the listed
// spelling is returned. An exact match wins, otherwise exactly one listed path
// may match.
func MatchListed(root string, listed []string, arg string) (string, bool) {
	if arg == "" || strings.HasSuffix(arg, "/") {
		return "", false
	}
	var segments []string
	if filepath.IsAbs(arg) {
		dir, err := filepath.EvalSymlinks(filepath.Dir(arg))
		if err != nil {
			return "", false
		}
		var ok bool
		if segments, ok = under(root, filepath.Join(dir, filepath.Base(arg))); !ok {
			return "", false
		}
	} else {
		clean := filepath.Clean(arg)
		if clean == "." || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
			return "", false
		}
		segments = strings.Split(filepath.ToSlash(clean), "/")
	}
	want := strings.Join(segments, "/")
	var found string
	count := 0
	for _, p := range listed {
		if p == want {
			return p, true
		}
		if sameSpelling(p, want) {
			found = p
			count++
		}
	}
	return found, count == 1
}

// under returns the segments of p below root, comparing names the way the file
// system does.
func under(root, p string) ([]string, bool) {
	rootParts := strings.Split(strings.Trim(root, "/"), "/")
	parts := strings.Split(strings.Trim(p, "/"), "/")
	if len(parts) <= len(rootParts) {
		return nil, false
	}
	for i, part := range rootParts {
		if !sameSpelling(part, parts[i]) {
			return nil, false
		}
	}
	return parts[len(rootParts):], true
}

func sameSpelling(a, b string) bool {
	return strings.EqualFold(norm.NFC.String(a), norm.NFC.String(b))
}

// UnderDoan reports whether the output file would sit in a directory named
// .doan, at any depth and in any repository, by its own path and by where its
// directory really leads: a file written there is listed as a new canvas. A
// relative output is read from the current directory.
func UnderDoan(output string) (bool, error) {
	abs, err := filepath.Abs(output)
	if err != nil {
		return false, err
	}
	dir := filepath.Dir(abs)
	if hasDoan(dir) {
		return true, nil
	}
	real, err := filepath.EvalSymlinks(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	return hasDoan(real), nil
}

func hasDoan(dir string) bool {
	for _, part := range strings.Split(dir, string(filepath.Separator)) {
		if strings.EqualFold(part, ".doan") {
			return true
		}
	}
	return false
}
