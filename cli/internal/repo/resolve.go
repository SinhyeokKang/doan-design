package repo

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

type State string

const (
	Inside  State = "inside"
	Missing State = "missing"
	Outside State = "outside"
)

func outside(rel string) bool {
	return rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

// Resolve resolves p once; a command resolving many paths uses one Resolver.
// Unexpected filesystem errors stay distinct from missing paths.
func Resolve(root, base, p string) (State, string, error) {
	return NewResolver(root).Resolve(base, p)
}

// Resolver resolves paths under one root for one command, reading each real directory at most once for its on-disk
// spellings. A file created after its directory was read is Missing for that Resolver.
type Resolver struct {
	root     string
	realRoot string
	rootInfo os.FileInfo
	spelling spelling
}

func NewResolver(root string) *Resolver {
	return NewResolverWith(root, os.ReadDir)
}

// NewResolverWith is NewResolver with the directory read replaced, so tests
// can count reads.
func NewResolverWith(root string, readDir func(string) ([]os.DirEntry, error)) *Resolver {
	return &Resolver{root: root, spelling: spelling{readDir: readDir, dirs: map[string]dirIndex{}}}
}

// Resolve compares lexically before resolving any link, the root's included,
// so a path outside the root is Outside even when links cannot be resolved.
func (r *Resolver) Resolve(base, p string) (State, string, error) {
	if filepath.IsAbs(p) {
		return Outside, "", nil
	}
	absoluteRoot, err := filepath.Abs(r.root)
	if err != nil {
		return "", "", err
	}
	if !filepath.IsAbs(base) {
		base = filepath.Join(absoluteRoot, base)
	}
	candidate := filepath.Join(base, p)
	rel, err := filepath.Rel(absoluteRoot, candidate)
	if err != nil {
		return "", "", err
	}
	if outside(rel) {
		return Outside, "", nil
	}
	resolved, err := filepath.EvalSymlinks(candidate)
	if err != nil {
		if IsMissingPath(err) {
			return Missing, "", nil
		}
		return "", "", err
	}
	if r.realRoot == "" {
		if r.realRoot, err = filepath.EvalSymlinks(absoluteRoot); err != nil {
			return "", "", err
		}
	}
	rel, err = filepath.Rel(r.realRoot, resolved)
	if err != nil {
		return "", "", err
	}
	if outside(rel) {
		// EvalSymlinks keeps a link target's own spelling, which may name the root in another letter
		// case or Unicode form (InsideRelative compares disk spellings for the same reason).
		if rel, err = r.rootAlias(resolved); err != nil {
			return "", "", err
		}
		if rel == "" {
			return Outside, "", nil
		}
	}
	rel, err = r.spelling.spell(r.realRoot, rel)
	if err != nil {
		if IsMissingPath(err) {
			return Missing, "", nil
		}
		return "", "", err
	}
	return Inside, filepath.ToSlash(rel), nil
}

// rootAlias returns resolved relative to the root when its leading segments name the root in another spelling, else "". It
// compares file identity, so it reads no directory outside the repo and a sibling such as repo beside Repo stays outside.
func (r *Resolver) rootAlias(resolved string) (string, error) {
	if r.rootInfo == nil {
		info, err := os.Stat(r.realRoot)
		if err != nil {
			return "", err
		}
		r.rootInfo = info
	}
	depth := len(strings.Split(r.realRoot, string(filepath.Separator)))
	parts := strings.Split(resolved, string(filepath.Separator))
	if len(parts) < depth {
		return "", nil
	}
	info, err := os.Stat(strings.Join(parts[:depth], string(filepath.Separator)))
	if err != nil || !os.SameFile(info, r.rootInfo) {
		return "", nil
	}
	return filepath.Join(append([]string{"."}, parts[depth:]...)...), nil
}

// IsMissingPath identifies unusable input paths without hiding permission or I/O failures.
func IsMissingPath(err error) bool {
	if os.IsNotExist(err) {
		return true
	}
	for _, code := range []error{syscall.ENOENT, syscall.ENOTDIR, syscall.EINVAL, syscall.ENAMETOOLONG, syscall.ELOOP} {
		if errors.Is(err, code) {
			return true
		}
	}
	// filepath.EvalSymlinks reports its own traversal limit without wrapping ELOOP.
	return err.Error() == "EvalSymlinks: too many links"
}

func diskSpelling(root, rel string) (string, error) {
	return spelling{readDir: os.ReadDir, dirs: map[string]dirIndex{}}.spell(root, rel)
}

// spelling keeps one index per real directory the walk reads, never per lexical path, since a changed link can make
// one lexical path name another directory; Lstat still decides identity at each lookup.
type spelling struct {
	readDir func(string) ([]os.DirEntry, error)
	dirs    map[string]dirIndex
}

// spell walks rel, a path below root with no links left in it, and returns it
// with each segment as the directory lists it.
func (s spelling) spell(root, rel string) (string, error) {
	if rel == "." {
		return rel, nil
	}
	parts := strings.Split(rel, string(filepath.Separator))
	dir := root
	for i, part := range parts {
		index, ok := s.dirs[dir]
		if !ok {
			entries, err := s.readDir(dir)
			if err != nil {
				return "", err
			}
			names := make([]string, len(entries))
			for j, entry := range entries {
				names[j] = entry.Name()
			}
			index = indexNames(names)
			s.dirs[dir] = index
		}
		exact, aliases := index.match(part)
		name := ""
		if exact {
			name = part
		} else {
			// Let the filesystem decide which case or Unicode spellings are aliases.
			// Lstat keeps a symlink distinct from its target and other links to it.
			requested, err := os.Lstat(filepath.Join(dir, part))
			if err != nil {
				return "", err
			}
			for _, alias := range aliases {
				info, err := os.Lstat(filepath.Join(dir, alias))
				if err != nil {
					return "", err
				}
				if os.SameFile(requested, info) {
					name = alias
					break
				}
			}
		}
		if name == "" {
			return "", &os.PathError{Op: "readdir", Path: filepath.Join(dir, part), Err: os.ErrNotExist}
		}
		parts[i] = name
		dir = filepath.Join(dir, name)
	}
	return filepath.Join(parts...), nil
}

// dirIndex holds one directory's names: the exact names, and the names under
// a key that every pair strings.EqualFold matches after NFC shares.
type dirIndex struct {
	exact  map[string]bool
	folded map[string][]string // in the order given
}

func indexNames(names []string) dirIndex {
	index := dirIndex{exact: make(map[string]bool, len(names)), folded: map[string][]string{}}
	for _, name := range names {
		index.exact[name] = true
		key := foldKey(name)
		index.folded[key] = append(index.folded[key], name)
	}
	return index
}

// match reports whether part is a name in the directory and, when it is not,
// the names equal to it under NFC and simple case folding, in directory order.
func (x dirIndex) match(part string) (bool, []string) {
	if x.exact[part] {
		return true, nil
	}
	normalized := norm.NFC.String(part)
	var aliases []string
	for _, name := range x.folded[foldKey(part)] {
		if strings.EqualFold(norm.NFC.String(name), normalized) {
			aliases = append(aliases, name)
		}
	}
	return false, aliases
}

// foldKey maps each rune to the smallest rune of its unicode.SimpleFold orbit, as strings.EqualFold compares (ß and ẞ
// share a key, ß and "ss" do not). Invalid bytes decode to U+FFFD on both sides, as in EqualFold.
func foldKey(name string) string {
	var b strings.Builder
	for _, r := range norm.NFC.String(name) {
		least := r
		for f := unicode.SimpleFold(r); f != r; f = unicode.SimpleFold(f) {
			if f < least {
				least = f
			}
		}
		b.WriteRune(least)
	}
	return b.String()
}
