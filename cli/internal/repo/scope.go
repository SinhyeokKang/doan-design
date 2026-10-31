package repo

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Scope is the one serving-scope computation shared by `doan ls` (which the app
// serves from) and `doan check` (css_not_served), so the two cannot disagree.
// Entries are real repo-relative paths in on-disk spelling.
func Scope(root string, config Config) ([]string, error) {
	metadataState, metadataRoot, err := Resolve(root, root, ".doan")
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	scope := []string{}
	add := func(p string) {
		// The config schema rejects only a literal ".", so a symlink such as
		// `doan -> .` would otherwise put the whole repo (`.env`, sources) in scope.
		protected := MetadataPath(p)
		if metadataState == Inside {
			if metadataRoot == "." {
				protected = protected || MetadataPath(".doan/"+p)
			}
			if p == metadataRoot || strings.HasPrefix(metadataRoot, p+"/") {
				protected = true
			}
			if strings.HasPrefix(p, metadataRoot+"/") {
				protected = protected || MetadataPath(".doan"+strings.TrimPrefix(p, metadataRoot))
			}
		}
		if p == "." || protected || seen[p] {
			return
		}
		seen[p] = true
		scope = append(scope, p)
	}
	for _, p := range append([]string{".doan/canvases", ".doan/ds", ".doan/assets"}, config.Serve...) {
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

// MetadataPath keeps project settings and comment logs out of the serving scope.
func MetadataPath(p string) bool {
	return (p == ".doan" || strings.HasPrefix(p, ".doan/")) &&
		!(p == ".doan/canvases" || strings.HasPrefix(p, ".doan/canvases/") ||
			p == ".doan/ds" || strings.HasPrefix(p, ".doan/ds/") ||
			p == ".doan/assets" || strings.HasPrefix(p, ".doan/assets/"))
}
