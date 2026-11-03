package exporttest

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
)

func TestSeedListsEveryCanvasAndServesTheConfiguredScope(t *testing.T) {
	root := Seed(t)
	got, err := repo.Canvases(root)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{BadWidth, Empty, Nested, Full, NoWidth, RefuseCSSScope, RefuseFrame, RefuseLink, RefuseMeta, RefuseMissing, RefuseParent, RefuseRoot, RefuseScope}
	if !reflect.DeepEqual(got, sorted(want)) {
		t.Fatalf("canvases = %q", got)
	}
	data, err := os.ReadFile(filepath.Join(root, ".doan/config.json"))
	if err != nil {
		t.Fatal(err)
	}
	config, code := repo.ParseConfig(data)
	if code != "" {
		t.Fatalf("config: %s", code)
	}
	scope, err := repo.Scope(root, config)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(scope, []string{".doan/assets", ".doan/canvases", ".doan/ds", "styles", "styles/tokens.css"}) {
		t.Fatalf("scope = %q", scope)
	}
	state, _, err := repo.Resolve(root, filepath.Join(root, ".doan/assets"), "escape.png")
	if err != nil || state != repo.Outside {
		t.Fatalf("escape.png = %s, %v; want outside", state, err)
	}
}

func TestSeedWidthAndFrameCases(t *testing.T) {
	root := Seed(t)
	parse := func(p string) canvas.Canvas {
		data, err := os.ReadFile(filepath.Join(root, p))
		if err != nil {
			t.Fatal(err)
		}
		c, err := canvas.Parse(p, data)
		if err != nil {
			t.Fatal(err)
		}
		return c
	}
	if c := parse(Full); c.Width != 1280 || len(c.Frames) != 1 {
		t.Fatalf("full: width %d, frames %d", c.Width, len(c.Frames))
	}
	if c := parse(Empty); c.Width != 1280 || len(c.Frames) != 0 {
		t.Fatalf("empty: width %d, frames %d", c.Width, len(c.Frames))
	}
	if c := parse(Nested); c.Width != 1280 || len(c.Frames) != 1 {
		t.Fatalf("nested: width %d, frames %d", c.Width, len(c.Frames))
	}
	if c := parse(NoWidth); c.HasWidth {
		t.Fatal("no-width has a width")
	}
	if c := parse(BadWidth); !c.HasWidth || c.Width != 0 {
		t.Fatalf("bad-width: has %v, width %d", c.HasWidth, c.Width)
	}
}

// POSTMORTEM 2026-10-31: a linked default directory is not served by default.
func TestSeedLinkedAssetsIsOutOfScopeUntilConfigured(t *testing.T) {
	root := SeedLinkedAssets(t)
	got, err := repo.Canvases(root)
	if err != nil || !reflect.DeepEqual(got, []string{Linked}) {
		t.Fatalf("canvases = %q, %v", got, err)
	}
	scope, err := repo.Scope(root, repo.Config{V: 1})
	if err != nil || !reflect.DeepEqual(scope, []string{".doan/canvases"}) {
		t.Fatalf("default scope = %q, %v", scope, err)
	}
	scope, err = repo.Scope(root, repo.Config{V: 1, Serve: []string{".doan/assets"}})
	if err != nil || !reflect.DeepEqual(scope, []string{".doan/canvases", "media"}) {
		t.Fatalf("configured scope = %q, %v", scope, err)
	}
}

func sorted(s []string) []string {
	out := append([]string{}, s...)
	for i := range out {
		for j := i + 1; j < len(out); j++ {
			if out[j] < out[i] {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	return out
}
