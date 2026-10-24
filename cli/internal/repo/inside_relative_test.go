package repo

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestInsideRelative(t *testing.T) {
	parent := real(t, t.TempDir())
	root := filepath.Join(parent, "Repo")
	put(t, root, "Styles/Tokens.css", "")
	put(t, parent, "Repo2/outside.css", "")
	link(t, root, filepath.Join(parent, "alias"))
	link(t, "Styles/Tokens.css", filepath.Join(root, "token-link"))
	link(t, filepath.Join(parent, "Repo2"), filepath.Join(root, "outside"))
	link(t, "absent", filepath.Join(root, "broken"))
	link(t, "loop", filepath.Join(root, "loop"))
	for _, tt := range []struct {
		name, root, path string
		state            State
		rel              string
	}{
		{"inside", root, root + "/Styles/Tokens.css", Inside, "Styles/Tokens.css"},
		{"token link", root, root + "/token-link", Inside, "Styles/Tokens.css"},
		{"root alias", parent + "/alias", root + "/Styles/Tokens.css", Inside, "Styles/Tokens.css"},
		{"token alias", root, parent + "/alias/Styles/Tokens.css", Inside, "Styles/Tokens.css"},
		{"parent segment", root, root + "/Styles/../Styles/Tokens.css", Inside, "Styles/Tokens.css"},
		{"root itself", root, root, Inside, "."},
		{"outside prefix sibling", root, parent + "/Repo2/outside.css", Outside, ""},
		{"outside link", root, root + "/outside/outside.css", Outside, ""},
		{"absent", root, root + "/missing.css", Missing, ""},
		{"not directory", root, root + "/Styles/Tokens.css/child", Missing, ""},
		{"dangling link", root, root + "/broken", Missing, ""},
		{"link loop", root, root + "/loop", Missing, ""},
		{"nul", root, root + "/a\x00", Missing, ""},
		{"long name", root, root + "/" + strings.Repeat("x", 300), Missing, ""},
		{"relative rejected", root, "Styles/Tokens.css", Outside, ""},
		{"empty rejected", root, "", Outside, ""},
	} {
		t.Run(tt.name, func(t *testing.T) {
			state, rel, err := InsideRelative(tt.root, tt.path)
			if err != nil || state != tt.state || rel != tt.rel {
				t.Fatalf("got %s %q %v; want %s %q", state, rel, err, tt.state, tt.rel)
			}
		})
	}
	t.Run("disk spelling for root and token", func(t *testing.T) {
		upper := strings.ToUpper(root)
		if _, err := os.Stat(upper); os.IsNotExist(err) {
			t.Skip("temporary filesystem is case-sensitive")
		} else if err != nil {
			t.Fatal(err)
		}
		for _, r := range []string{root, upper} {
			for _, p := range []string{root + "/Styles/Tokens.css", strings.ToUpper(root + "/Styles/Tokens.css")} {
				state, rel, err := InsideRelative(r, p)
				if err != nil || state != Inside || rel != "Styles/Tokens.css" {
					t.Fatalf("%s %s: %s %q %v", r, p, state, rel, err)
				}
			}
		}
	})
}
