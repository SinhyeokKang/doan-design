package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestInitAbsoluteTokenCSS(t *testing.T) {
	for _, mode := range []string{"plain", "root alias", "token alias", "case", "parent segment", "mcp"} {
		t.Run(mode, func(t *testing.T) {
			root := filepath.Join(t.TempDir(), "Repo")
			putFile(t, root, "Styles/Tokens.css", ":root{--x:red}")
			token := root + "/Styles/Tokens.css"
			repoArg := root
			alias := filepath.Join(t.TempDir(), "alias")
			if err := os.Symlink(root, alias); err != nil {
				t.Fatal(err)
			}
			switch mode {
			case "root alias":
				repoArg = alias
			case "token alias":
				token = alias + "/Styles/Tokens.css"
			case "parent segment":
				token = root + "/Styles/../Styles/Tokens.css"
			case "case":
				repoArg = strings.ToUpper(root)
				if _, err := os.Stat(repoArg); os.IsNotExist(err) {
					t.Skip("temporary filesystem is case-sensitive")
				} else if err != nil {
					t.Fatal(err)
				}
				token = strings.ToLower(token)
			}
			var got map[string]any
			if mode == "mcp" {
				env := callTool(t, mcpClient(t), "init", map[string]any{"repo": repoArg, "tokenCss": token})
				if env["ok"] != true {
					t.Fatal(env)
				}
				got = env["result"].(map[string]any)
			} else {
				got = result(t, repoArg, 0, "init", "--token-css", token)
			}
			if got["tokenCss"] != "Styles/Tokens.css" || got["initialized"] != true {
				t.Fatal(got)
			}
			var config map[string]any
			if err := json.Unmarshal([]byte(readFile(t, root, ".doan/config.json")), &config); err != nil {
				t.Fatal(err)
			}
			if config["tokenCss"] != "Styles/Tokens.css" {
				t.Fatal(config)
			}
		})
	}
}

func TestInitRejectsInvalidAbsoluteTokenWithoutWrites(t *testing.T) {
	for _, mode := range []string{"outside", "outside link", "missing", "not directory", "loop", "broken", "root"} {
		t.Run(mode, func(t *testing.T) {
			root := t.TempDir()
			other := t.TempDir()
			putFile(t, other, "outside.css", "")
			putFile(t, root, "tokens.css", "")
			token := root + "/missing"
			switch mode {
			case "outside":
				token = other + "/outside.css"
			case "outside link", "loop", "broken":
				target := other + "/outside.css"
				if mode == "loop" {
					target = "link"
				}
				if mode == "broken" {
					target = "absent"
				}
				token = root + "/link"
				if err := os.Symlink(target, token); err != nil {
					t.Fatal(err)
				}
			case "not directory":
				token = root + "/tokens.css/child"
			case "root":
				token = root
			}
			failure(t, root, "usage_error", "init", "--token-css", token)
			for _, p := range []string{".doan", "doan", ".gitattributes"} {
				if _, err := os.Lstat(filepath.Join(root, p)); !os.IsNotExist(err) {
					t.Fatalf("unexpected write %s: %v", p, err)
				}
			}
		})
	}
}
