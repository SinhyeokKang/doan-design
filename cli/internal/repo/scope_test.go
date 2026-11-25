package repo

import (
	"encoding/json"
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

func TestScopeCanvasDirectory(t *testing.T) {
	root := real(t, t.TempDir())
	if got := scopeOf(t, root, Config{}); !reflect.DeepEqual(got, []string{}) {
		t.Fatalf("no design: %#v", got)
	}
	put(t, root, ".doan/canvases", "")
	if got := scopeOf(t, root, Config{}); !reflect.DeepEqual(got, []string{".doan/canvases"}) {
		t.Fatalf("design file: %#v", got)
	}
	if err := os.Remove(filepath.Join(root, ".doan/canvases")); err != nil {
		t.Fatal(err)
	}
	put(t, root, ".doan/canvases/a.html", "")
	if got := scopeOf(t, root, Config{}); !reflect.DeepEqual(got, []string{".doan/canvases"}) {
		t.Fatalf("design dir: %#v", got)
	}
}

func TestScopeDesignSystemDirectory(t *testing.T) {
	root := real(t, t.TempDir())
	put(t, root, ".doan/ds/button.html", "")
	if got := scopeOf(t, root, Config{}); !reflect.DeepEqual(got, []string{".doan/ds"}) {
		t.Fatalf("ds only: %#v", got)
	}
	put(t, root, ".doan/canvases/a.html", "")
	put(t, root, ".doan/assets/a.png", "")
	if got := scopeOf(t, root, Config{}); !reflect.DeepEqual(got, []string{".doan/assets", ".doan/canvases", ".doan/ds"}) {
		t.Fatalf("all: %#v", got)
	}
}

func TestMetadataPathDesignSystem(t *testing.T) {
	for p, want := range map[string]bool{
		".doan/ds":               false,
		".doan/ds/x.css":         false,
		".doan/ds/nested/a.html": false,
		".doan/dsx":              true,
		".doan/dsx/a.css":        true,
		".doan/comments":         true,
		".doan/comments/a.jsonl": true,
		".doan/config.json":      true,
		".doan/canvases/a.css":   false,
	} {
		if got := MetadataPath(p); got != want {
			t.Errorf("%s: %v, want %v", p, got, want)
		}
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
	link(t, "../..", filepath.Join(root, ".doan/canvases"))
	link(t, root, filepath.Join(root, "assets"))
	put(t, root, "tokens.css", "")
	got := scopeOf(t, root, Config{TokenCSS: "tokens.css", Serve: []string{"assets", "assets/."}})
	if !reflect.DeepEqual(got, []string{"tokens.css"}) {
		t.Fatalf("%#v", got)
	}
}

func TestScopeDedupesByRealPath(t *testing.T) {
	root := real(t, t.TempDir())
	put(t, root, ".doan/canvases/a.html", "")
	put(t, root, "tokens.css", "")
	link(t, ".doan/canvases", filepath.Join(root, "alias"))
	got := scopeOf(t, root, Config{TokenCSS: "tokens.css", Serve: []string{".doan/canvases", "./.doan/canvases/", "alias", "tokens.css"}})
	if !reflect.DeepEqual(got, []string{".doan/canvases", "tokens.css"}) {
		t.Fatalf("%#v", got)
	}
}

func TestScopeDedupesLetterCase(t *testing.T) {
	root := real(t, t.TempDir())
	put(t, root, ".doan/canvases/a.html", "")
	put(t, root, "tokens.css", "")
	if _, err := os.Stat(filepath.Join(root, "..DOAN/CANVASES/CANVASES")); os.IsNotExist(err) {
		t.Skip("temporary filesystem is case-sensitive")
	} else if err != nil {
		t.Fatal(err)
	}
	got := scopeOf(t, root, Config{TokenCSS: "TOKENS.CSS", Serve: []string{"..DOAN/CANVASES/CANVASES", "Tokens.css"}})
	if !reflect.DeepEqual(got, []string{".doan/canvases", "tokens.css"}) {
		t.Fatalf("%#v", got)
	}
}

func TestScopeSortsByBytes(t *testing.T) {
	root := real(t, t.TempDir())
	put(t, root, ".doan/canvases/a.css", "")
	put(t, root, "design-x/b.css", "")
	put(t, root, "B.css", "")
	got := scopeOf(t, root, Config{Serve: []string{".doan/canvases/a.css", "design-x", "B.css"}})
	if !reflect.DeepEqual(got, []string{".doan/canvases", ".doan/canvases/a.css", "B.css", "design-x"}) {
		t.Fatalf("%#v", got)
	}
}

func TestLegacyDesignIsNotInDefaultScope(t *testing.T) {
	root := real(t, t.TempDir())
	put(t, root, "design/private.html", "")
	put(t, root, ".doan/canvases/canvas.html", "")
	if got := scopeOf(t, root, Config{}); !reflect.DeepEqual(got, []string{".doan/canvases"}) {
		t.Fatalf("default scope must only include doan: %#v", got)
	}
}

// A linked default directory must not put its real target in the default scope: outside the default directories only
// configured paths are served (ARCHITECTURE §3), and the target may be source code.
func TestScopeSkipsLinkedDefaultDirectory(t *testing.T) {
	for _, dir := range []string{".doan/canvases", ".doan/ds", ".doan/assets"} {
		t.Run(dir, func(t *testing.T) {
			root := real(t, t.TempDir())
			put(t, root, "src/private.js", "")
			link(t, "../src", filepath.Join(root, dir))
			if got := scopeOf(t, root, Config{}); !reflect.DeepEqual(got, []string{}) {
				t.Fatalf("empty config: %#v", got)
			}
			if got := scopeOf(t, root, Config{Serve: []string{"src"}}); !reflect.DeepEqual(got, []string{"src"}) {
				t.Fatalf("configured: %#v", got)
			}
		})
	}
}

func TestScopeSkipsDefaultsUnderLinkedMetadata(t *testing.T) {
	root := real(t, t.TempDir())
	for _, dir := range []string{"canvases", "ds", "assets"} {
		put(t, root, "src/"+dir+"/a.html", "")
	}
	link(t, "src", filepath.Join(root, ".doan"))
	if got := scopeOf(t, root, Config{}); !reflect.DeepEqual(got, []string{}) {
		t.Fatalf("empty config: %#v", got)
	}
	if got := scopeOf(t, root, Config{Serve: []string{"src/ds"}}); !reflect.DeepEqual(got, []string{"src/ds"}) {
		t.Fatalf("configured: %#v", got)
	}
}

// The cases are shared with the app's withheld test, so the server and doan check cannot drift apart.
func TestWithheld(t *testing.T) {
	var fixture struct {
		Cases []struct {
			Path     string
			Withheld bool
		}
	}
	data, err := os.ReadFile("../../../schema/fixtures/serve-withheld/cases.json")
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	if len(fixture.Cases) == 0 {
		t.Fatal("no fixtures")
	}
	for _, tt := range fixture.Cases {
		if got := Withheld(tt.Path); got != tt.Withheld {
			t.Errorf("Withheld(%q) = %v, want %v", tt.Path, got, tt.Withheld)
		}
	}
}

// .git and .env paths are never served, whatever the config lists (ARCHITECTURE §3 'Never served').
func TestScopeWithholdsGitAndEnv(t *testing.T) {
	root := real(t, t.TempDir())
	put(t, root, ".doan/canvases/a.html", "")
	put(t, root, ".env", "SECRET=1")
	put(t, root, ".env.local", "SECRET=1")
	put(t, root, ".git/config", "")
	put(t, root, "web/.env", "SECRET=1")
	put(t, root, "web/page.css", "")
	put(t, root, "vendor/x/.git/HEAD", "")
	put(t, root, ".env.css", "")
	if err := os.Symlink(".env", filepath.Join(root, "settings")); err != nil {
		t.Fatal(err)
	}
	config := Config{TokenCSS: ".env.css", Serve: []string{".env", ".env.local", ".git", ".git/config", "web/.env", "vendor/x/.git", "settings", "web"}}
	if got := scopeOf(t, root, config); !reflect.DeepEqual(got, []string{".doan/canvases", "web"}) {
		t.Fatalf("scope: %#v", got)
	}
}

// A serve entry withheld by its written name stays out even when it links to a
// path that is not withheld, so the scope agrees with `serve_withheld`.
func TestScopeDropsEntryWithheldByWrittenName(t *testing.T) {
	root := real(t, t.TempDir())
	put(t, root, "docs/public/a.css", "")
	link(t, "docs/public", filepath.Join(root, ".env-docs"))
	link(t, "docs/public", filepath.Join(root, "web/.git"))
	config := Config{Serve: []string{".env-docs", "./.ENV-docs/", "web/.git"}}
	if got := scopeOf(t, root, config); len(got) != 0 {
		t.Fatalf("scope: %#v", got)
	}
}
