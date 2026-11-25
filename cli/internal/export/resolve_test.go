package export

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/export/exporttest"
	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
)

func TestResolveAsset(t *testing.T) {
	root := exporttest.Seed(t)
	scope, err := repo.Scope(root, repo.Config{V: 1, TokenCSS: "styles/tokens.css", Serve: []string{"styles"}})
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		base, href string
		want       resolved
	}{
		{".doan/canvases", "../assets/images/hero.png", resolved{assetInside, ".doan/assets/images/hero.png", ""}},
		{".doan/canvases", "./../assets/images/hero.png?v=2#x", resolved{assetInside, ".doan/assets/images/hero.png", ""}},
		{".doan/canvases", "../assets/images/%EB%A1%9C%EA%B3%A0%20%ED%8C%8C%EC%9D%BC.png", resolved{assetInside, ".doan/assets/images/로고 파일.png", ""}},
		{".doan/canvases/flows", "../../../styles/tokens.css", resolved{assetInside, "styles/tokens.css", ""}},
		{"styles", "../.doan/assets/fonts/brand.woff2", resolved{assetInside, ".doan/assets/fonts/brand.woff2", ""}},
		{".doan/canvases", "../../../outside.png", resolved{assetRefused, "", ReasonOutside}},
		{".doan/canvases", "..%2F..%2F..%2Foutside.png", resolved{assetRefused, "", ReasonOutside}},
		{".doan/canvases", "/logo.png", resolved{assetRefused, "", ReasonOutside}},
		{".doan/canvases", "../assets/escape.png", resolved{assetRefused, "", ReasonOutside}},
		{".doan/canvases", "../../src/secret.png", resolved{assetRefused, "", ReasonNotServed}},
		{"styles", "../src/secret.png", resolved{assetRefused, "", ReasonNotServed}},
		{".doan/canvases", "../config.json", resolved{assetRefused, "", ReasonNotServed}},
		{".doan/canvases", "../comments/full.jsonl", resolved{assetRefused, "", ReasonNotServed}},
		{".doan/canvases", "../assets/images/none.png", resolved{assetMissing, "", ""}},
		{".doan/canvases", "../assets/images", resolved{assetMissing, "", ""}},
		{"styles", "gone.png", resolved{assetMissing, "", ""}},
	}
	resolver := repo.NewResolver(root)
	for _, c := range cases {
		got, err := resolveAsset(resolver, root, scope, c.base, c.href)
		if err != nil || got != c.want {
			t.Errorf("resolveAsset(%q, %q) = %+v, %v; want %+v", c.base, c.href, got, err, c.want)
		}
	}
}

// A linked default directory serves nothing until `serve` names it, and export follows the same scope.
func TestResolveAssetInLinkedDefaultDirectory(t *testing.T) {
	root := exporttest.SeedLinkedAssets(t)
	scope, err := repo.Scope(root, repo.Config{V: 1})
	if err != nil {
		t.Fatal(err)
	}
	got, err := resolveAsset(repo.NewResolver(root), root, scope, ".doan/canvases", "../assets/logo.png")
	if err != nil || got != (resolved{assetRefused, "", ReasonNotServed}) {
		t.Fatalf("default scope: %+v, %v", got, err)
	}
	scope, err = repo.Scope(root, repo.Config{V: 1, Serve: []string{".doan/assets"}})
	if err != nil {
		t.Fatal(err)
	}
	got, err = resolveAsset(repo.NewResolver(root), root, scope, ".doan/canvases", "../assets/logo.png")
	if err != nil || got != (resolved{assetInside, "media/logo.png", ""}) {
		t.Fatalf("configured scope: %+v, %v", got, err)
	}
}

// Export includes a file exactly when the app could serve it, so it holds back
// what the server holds back inside a served directory.
func TestResolveAssetWithheldInsideServedDirectory(t *testing.T) {
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range []string{".doan/canvases/a.html", "styles/.env.png", "styles/.git/logo.png", "styles/logo.png"} {
		if err := os.MkdirAll(filepath.Join(root, filepath.Dir(p)), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(root, p), []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	scope, err := repo.Scope(root, repo.Config{V: 1, Serve: []string{"styles"}})
	if err != nil {
		t.Fatal(err)
	}
	resolver := repo.NewResolver(root)
	for href, want := range map[string]resolved{
		"../../styles/logo.png":      {assetInside, "styles/logo.png", ""},
		"../../styles/.env.png":      {assetRefused, "", ReasonNotServed},
		"../../styles/.git/logo.png": {assetRefused, "", ReasonNotServed},
	} {
		got, err := resolveAsset(resolver, root, scope, ".doan/canvases", href)
		if err != nil || got != want {
			t.Errorf("resolveAsset(%q) = %+v, %v; want %+v", href, got, err, want)
		}
	}
}
