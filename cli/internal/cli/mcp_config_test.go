package cli

import (
	"path/filepath"
	"reflect"
	"testing"
)

func TestMCPConfigMatchesCLI(t *testing.T) {
	root := initialized(t)
	putFile(t, root, "styles/tokens.css", "")
	putFile(t, root, "assets/a.txt", "")
	cs := mcpClient(t)
	for _, tt := range []struct {
		name string
		args map[string]any
		cli  []string
	}{
		{"read", map[string]any{}, nil},
		{"set", map[string]any{"tokenCss": "styles/tokens.css"}, []string{"--token-css", filepath.Join(root, "styles/tokens.css")}},
		{"clear", map[string]any{"clearTokenCss": true}, []string{"--clear-token-css"}},
		{"false", map[string]any{"clearTokenCss": false}, nil},
		{"serve", map[string]any{"addServe": []string{"assets", "styles"}, "removeServe": []string{"assets"}}, []string{"--add-serve", filepath.Join(root, "assets"), "--add-serve", filepath.Join(root, "styles"), "--remove-serve", filepath.Join(root, "assets")}},
		{"absolute", map[string]any{"tokenCss": filepath.Join(root, "styles/tokens.css")}, []string{"--token-css", filepath.Join(root, "styles/tokens.css")}},
		{"conflict", map[string]any{"tokenCss": "styles/tokens.css", "clearTokenCss": true}, []string{"--token-css", filepath.Join(root, "styles/tokens.css"), "--clear-token-css"}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			baseline := `{"v":1}`
			if tt.name == "clear" {
				baseline = `{"v":1,"tokenCss":"styles/tokens.css"}`
			}
			putFile(t, root, ".doan/config.json", baseline)
			tt.args["repo"] = root
			got := callTool(t, cs, "config", tt.args)
			putFile(t, root, ".doan/config.json", baseline)
			want := cliEnvelope(t, append([]string{"config", "--repo", root}, tt.cli...)...)
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("got %#v want %#v", got, want)
			}
		})
	}
	for _, args := range []map[string]any{
		{"addServe": nil}, {"addServe": "assets"}, {"removeServe": []any{nil}},
		{"clearTokenCss": nil}, {"clearTokenCss": "true"}, {"tokenCss": false}, {"repo": "relative"}, {"unknown": true},
	} {
		toolCode(t, cs, "config", args, "usage_error")
	}
}

func TestMCPConfigRelativePathsUseDiscoveredRepo(t *testing.T) {
	root := initialized(t)
	putFile(t, root, "nested/placeholder", "")
	putFile(t, root, "tokens.css", "")
	t.Chdir(filepath.Join(root, "nested"))
	cs := mcpClient(t)
	got := callTool(t, cs, "config", map[string]any{"tokenCss": "tokens.css"})
	if got["ok"] != true || got["result"].(map[string]any)["tokenCss"] != "tokens.css" {
		t.Fatal(got)
	}
}
