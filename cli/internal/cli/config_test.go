package cli

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestConfigReadAndWrites(t *testing.T) {
	root := initialized(t)
	putFile(t, root, "styles/Tokens.css", ":root {}")
	putFile(t, root, "assets/image.svg", "svg")
	path := filepath.Join(root, ".doan/config.json")
	old := time.Unix(100, 0)
	if err := os.Chtimes(path, old, old); err != nil {
		t.Fatal(err)
	}
	for _, args := range [][]string{{"config"}, {"config", "--clear-token-css"}} {
		got := result(t, root, 0, args...)
		if got["changed"] != false || len(got["serve"].([]any)) != 0 {
			t.Fatal(got)
		}
		st, err := os.Stat(path)
		if err != nil || !st.ModTime().Equal(old) {
			t.Fatal(st, err)
		}
	}
	got := result(t, root, 0, "config", "--token-css", filepath.Join(root, "styles/Tokens.css"), "--add-serve", filepath.Join(root, "assets"))
	if got["changed"] != true || got["tokenCss"] != "styles/Tokens.css" || got["serve"].([]any)[0] != "assets" {
		t.Fatal(got)
	}
	got = result(t, root, 0, "config", "--clear-token-css", "--add-serve", filepath.Join(root, "styles"), "--remove-serve", filepath.Join(root, "assets"))
	if _, ok := got["tokenCss"]; ok {
		t.Fatal(got)
	}
	if got["changed"] != true || len(got["serve"].([]any)) != 1 || got["serve"].([]any)[0] != "styles" {
		t.Fatal(got)
	}
	before := readFile(t, root, ".doan/config.json")
	if err := os.Chtimes(path, old, old); err != nil {
		t.Fatal(err)
	}
	got = result(t, root, 0, "config", "--add-serve", filepath.Join(root, "styles"), "--remove-serve", filepath.Join(root, "assets"))
	st, err := os.Stat(path)
	if err != nil || !st.ModTime().Equal(old) || got["changed"] != false || before != readFile(t, root, ".doan/config.json") {
		t.Fatal(got, st, err)
	}
	entries, err := os.ReadDir(filepath.Dir(path))
	if err != nil || len(entries) != 1 {
		t.Fatal(entries, err)
	}
}

func TestConfigPathsAndDiscovery(t *testing.T) {
	root := initialized(t)
	putFile(t, root, "nested/Tokens.css", "")
	t.Chdir(filepath.Join(root, "nested"))
	got := cliEnvelope(t, "config", "--token-css", "nested/Tokens.css")
	if got["ok"] != true || got["result"].(map[string]any)["tokenCss"] != "nested/Tokens.css" {
		t.Fatal(got)
	}
	failure(t, filepath.Join(root, "nested"), "repo_not_found", "config")
	got = result(t, root, 0, "config", "--token-css", "nested/Tokens.css")
	if got["changed"] != false {
		t.Fatal(got)
	}
	if _, err := os.Stat("tokens.css"); err == nil {
		got = result(t, root, 0, "config", "--token-css", "nested/tokens.css")
		if got["tokenCss"] != "nested/Tokens.css" || got["changed"] != false {
			t.Fatal(got)
		}
	}
}

func TestConfigInvalidInputsDoNotWrite(t *testing.T) {
	root := initialized(t)
	other := t.TempDir()
	putFile(t, other, "outside.css", "")
	putFile(t, root, "tokens.css", "")
	if err := os.Symlink(other, filepath.Join(root, "escape")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(root, filepath.Join(root, "root-link")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(root, ".doan"), filepath.Join(root, "config-link")); err != nil {
		t.Fatal(err)
	}
	before := readFile(t, root, ".doan/config.json")
	for _, args := range [][]string{
		{"--token-css", filepath.Join(other, "outside.css")},
		{"--token-css", filepath.Join(root, "missing.css")},
		{"--token-css", filepath.Join(root, "design")},
		{"--token-css", filepath.Join(root, "escape/outside.css")},
		{"--token-css", ""},
		{"--token-css", filepath.Join(root, "tokens.css"), "--clear-token-css"},
		{"--add-serve", root}, {"--add-serve", filepath.Join(root, "root-link")},
		{"--add-serve", filepath.Join(root, ".doan")},
		{"--add-serve", filepath.Join(root, "config-link/config.json")},
		{"--add-serve", filepath.Join(root, "missing")},
		{"--token-css", filepath.Join(root, "tokens.css/x.css")},
		{"--token-css", filepath.Join(root, strings.Repeat("x", 300))},
		{"--token-css", "\x00"}, {"extra"},
	} {
		failure(t, root, "usage_error", append([]string{"config"}, args...)...)
		if readFile(t, root, ".doan/config.json") != before {
			t.Fatal(args)
		}
	}
	failure(t, t.TempDir(), "repo_not_found", "config")
	for _, tt := range []struct{ body, code string }{{"broken", "invalid_config"}, {`{"v":2}`, "unsupported_version"}} {
		putFile(t, root, ".doan/config.json", tt.body)
		failure(t, root, tt.code, "config", "--clear-token-css")
		if readFile(t, root, ".doan/config.json") != tt.body {
			t.Fatal(tt)
		}
	}
}

func TestConfigDoesNotWriteOutsideLinkedDirectory(t *testing.T) {
	root := t.TempDir()
	other := initialized(t)
	if err := os.Symlink(filepath.Join(other, ".doan"), filepath.Join(root, ".doan")); err != nil {
		t.Fatal(err)
	}
	putFile(t, root, "tokens.css", "")
	before := readFile(t, other, ".doan/config.json")
	failure(t, root, "usage_error", "config", "--token-css", filepath.Join(root, "tokens.css"))
	if readFile(t, other, ".doan/config.json") != before {
		t.Fatal("outside config changed")
	}
}

func TestConfigRemoveMissingAndNoncanonicalServe(t *testing.T) {
	for _, stored := range []string{"styles", "./styles"} {
		for _, absolute := range []bool{false, true} {
			root := initialized(t)
			putFile(t, root, "styles/file", "")
			putFile(t, root, ".doan/config.json", `{"v":1,"serve":["`+stored+`"]}`)
			if err := os.RemoveAll(filepath.Join(root, "styles")); err != nil {
				t.Fatal(err)
			}
			path := "styles"
			if absolute {
				path = filepath.Join(root, path)
			}
			t.Chdir(root)
			got := result(t, root, 0, "config", "--remove-serve", path)
			if got["changed"] != true || len(got["serve"].([]any)) != 0 {
				t.Fatal(stored, path, got)
			}
			got = result(t, root, 0, "config", "--remove-serve", path)
			if got["changed"] != false {
				t.Fatal(got)
			}
			putFile(t, root, "styles/file", "")
			got = result(t, root, 0, "config", "--add-serve", path)
			if len(got["serve"].([]any)) != 1 || got["serve"].([]any)[0] != "styles" {
				t.Fatal(got)
			}
		}
	}
}

func TestConfigRemoveExistingAliasAndOutside(t *testing.T) {
	root := initialized(t)
	putFile(t, root, "styles/file", "")
	if err := os.Symlink("styles", filepath.Join(root, "alias")); err != nil {
		t.Fatal(err)
	}
	for _, stored := range []string{"./styles", "alias"} {
		putFile(t, root, ".doan/config.json", `{"v":1,"serve":["`+stored+`"]}`)
		got := result(t, root, 0, "config", "--remove-serve", filepath.Join(root, "styles"))
		if got["changed"] != true || len(got["serve"].([]any)) != 0 {
			t.Fatal(stored, got)
		}
	}
	failure(t, root, "usage_error", "config", "--remove-serve", filepath.Join(t.TempDir(), "missing"))
}

func TestMCPConfigRemoveMissingServe(t *testing.T) {
	root := initialized(t)
	putFile(t, root, ".doan/config.json", `{"v":1,"serve":["./missing"]}`)
	got := callTool(t, mcpClient(t), "config", map[string]any{"repo": root, "removeServe": []string{"missing"}})
	if got["ok"] != true || got["result"].(map[string]any)["changed"] != true {
		t.Fatal(got)
	}
}

func TestConfigRelativePathsUseRepoOutsideCwd(t *testing.T) {
	root := initialized(t)
	putFile(t, root, "styles/tokens.css", "")
	t.Chdir(t.TempDir())
	got := result(t, root, 0, "config", "--token-css", "styles/tokens.css", "--add-serve", "styles")
	if got["tokenCss"] != "styles/tokens.css" || got["serve"].([]any)[0] != "styles" {
		t.Fatal(got)
	}
	got = result(t, root, 0, "config", "--remove-serve", "styles")
	if len(got["serve"].([]any)) != 0 {
		t.Fatal(got)
	}
}
