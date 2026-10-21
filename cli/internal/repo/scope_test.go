package repo

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func scopeOf(t *testing.T, root string, config Config) []string {
	t.Helper()
	got, err := Scope(root, config)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

func TestScopeDesign(t *testing.T) {
	root := real(t, t.TempDir())
	if got := scopeOf(t, root, Config{}); !reflect.DeepEqual(got, []string{}) {
		t.Fatalf("no design: %#v", got)
	}
	put(t, root, "design", "")
	if got := scopeOf(t, root, Config{}); !reflect.DeepEqual(got, []string{"design"}) {
		t.Fatalf("design file: %#v", got)
	}
	if err := os.Remove(filepath.Join(root, "design")); err != nil {
		t.Fatal(err)
	}
	put(t, root, "design/a.html", "")
	if got := scopeOf(t, root, Config{}); !reflect.DeepEqual(got, []string{"design"}) {
		t.Fatalf("design dir: %#v", got)
	}
}

func TestScopeTokenCSS(t *testing.T) {
	root := real(t, t.TempDir())
	outside := t.TempDir()
	put(t, outside, "out.css", "")
	put(t, root, "tokens.css", "")
	put(t, root, "styles/x.css", "")
	link(t, filepath.Join(outside, "out.css"), filepath.Join(root, "out.css"))
	for _, tt := range []struct {
		token string
		want  []string
	}{
		{"", []string{}},
		{"tokens.css", []string{"tokens.css"}},
		{"./tokens.css", []string{"tokens.css"}},
		{"out.css", []string{}},
		{"missing.css", []string{}},
		{"styles", []string{}},
	} {
		if got := scopeOf(t, root, Config{TokenCSS: tt.token}); !reflect.DeepEqual(got, tt.want) {
			t.Errorf("tokenCss %q: %#v", tt.token, got)
		}
	}
}

func TestScopeServe(t *testing.T) {
	root := real(t, t.TempDir())
	outside := t.TempDir()
	put(t, root, "assets/logo.svg", "")
	put(t, root, "fonts.css", "")
	link(t, outside, filepath.Join(root, "linked"))
	link(t, "loop", filepath.Join(root, "loop"))
	got := scopeOf(t, root, Config{Serve: []string{"fonts.css", "assets", "missing", "linked", "fonts.css/x", "a\x00", strings.Repeat("x", 300), "loop"}})
	if !reflect.DeepEqual(got, []string{"assets", "fonts.css"}) {
		t.Fatalf("%#v", got)
	}
}

func TestScopeDropsRepoRoot(t *testing.T) {
	root := real(t, t.TempDir())
	link(t, ".", filepath.Join(root, "design"))
	link(t, root, filepath.Join(root, "assets"))
	put(t, root, "tokens.css", "")
	got := scopeOf(t, root, Config{TokenCSS: "tokens.css", Serve: []string{"assets", "assets/."}})
	if !reflect.DeepEqual(got, []string{"tokens.css"}) {
		t.Fatalf("%#v", got)
	}
}

func TestScopeDedupesByRealPath(t *testing.T) {
	root := real(t, t.TempDir())
	put(t, root, "design/a.html", "")
	put(t, root, "tokens.css", "")
	link(t, "design", filepath.Join(root, "alias"))
	got := scopeOf(t, root, Config{TokenCSS: "tokens.css", Serve: []string{"design", "./design/", "alias", "tokens.css"}})
	if !reflect.DeepEqual(got, []string{"design", "tokens.css"}) {
		t.Fatalf("%#v", got)
	}
}

func TestScopeDedupesLetterCase(t *testing.T) {
	root := real(t, t.TempDir())
	put(t, root, "design/a.html", "")
	put(t, root, "tokens.css", "")
	if _, err := os.Stat(filepath.Join(root, "DESIGN")); os.IsNotExist(err) {
		t.Skip("temporary filesystem is case-sensitive")
	} else if err != nil {
		t.Fatal(err)
	}
	got := scopeOf(t, root, Config{TokenCSS: "TOKENS.CSS", Serve: []string{"DESIGN", "Tokens.css"}})
	if !reflect.DeepEqual(got, []string{"design", "tokens.css"}) {
		t.Fatalf("%#v", got)
	}
}

func TestScopeSortsByBytes(t *testing.T) {
	root := real(t, t.TempDir())
	put(t, root, "design/a.css", "")
	put(t, root, "design-x/b.css", "")
	put(t, root, "B.css", "")
	got := scopeOf(t, root, Config{Serve: []string{"design/a.css", "design-x", "B.css"}})
	if !reflect.DeepEqual(got, []string{"B.css", "design", "design-x", "design/a.css"}) {
		t.Fatalf("%#v", got)
	}
}
