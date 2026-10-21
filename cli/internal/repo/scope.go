package repo

import (
	"os"
	"path/filepath"
	"sort"
)

// Scope is the one serving-scope computation shared by `doan ls` (which the app
// serves from) and `doan check` (css_not_served), so the two cannot disagree.
// Entries are real repo-relative paths in on-disk spelling.
func Scope(root string, config Config) ([]string, error) {
	seen := map[string]bool{}
	scope := []string{}
	add := func(p string) {
		// The config schema rejects only a literal ".", so a symlink such as
		// `design -> .` would otherwise put the whole repo (`.env`, sources) in scope.
		if p == "." || seen[p] {
			return
		}
		seen[p] = true
		scope = append(scope, p)
	}
	for _, p := range append([]string{"design"}, config.Serve...) {
		state, real, err := Resolve(root, root, p)
		if err != nil {
			return nil, err
		}
		if state == Inside {
			add(real)
		}
	}
	if config.TokenCSS != "" {
		state, real, err := Resolve(root, root, config.TokenCSS)
		if err != nil {
			return nil, err
		}
		if state == Inside {
			info, err := os.Stat(filepath.Join(root, real))
			if err != nil {
				return nil, err
			}
			if info.Mode().IsRegular() {
				add(real)
			}
		}
	}
	sort.Strings(scope)
	return scope, nil
}
