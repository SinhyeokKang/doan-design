package repo

import (
	"encoding/json"
	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
	"os"
	"path/filepath"
	"testing"
)

func TestParseConfigFixtures(t *testing.T) {
	for _, kind := range []string{"valid", "invalid"} {
		paths, err := filepath.Glob("../../../schema/fixtures/config/" + kind + "/*.json")
		if err != nil || len(paths) == 0 {
			t.Fatalf("fixtures: %v", err)
		}
		for _, p := range paths {
			t.Run(filepath.Base(p), func(t *testing.T) {
				b, err := os.ReadFile(p)
				if err != nil {
					t.Fatal(err)
				}
				var v any
				if err = json.Unmarshal(b, &v); err != nil {
					t.Fatal(err)
				}
				_, code := ParseConfig(b)
				want := ""
				if kind == "invalid" {
					want = "invalid_config"
				}
				if filepath.Base(p) == "unknown-version.json" {
					want = "unsupported_version"
				}
				if code != want {
					t.Fatalf("%s != %s", code, want)
				}
				if (code == "") != (formats.ValidateConfig(v) == nil) {
					t.Fatal("validator disagreement")
				}
			})
		}
	}
}
func TestParseConfigBoundaries(t *testing.T) {
	for _, tt := range []struct{ input, code string }{{`{"v":1e400}`, "unsupported_version"}, {`{"v":1.0}`, ""}, {`{"v":2,"x":1}`, "unsupported_version"}, {"\ufeff{\"v\":1}", "invalid_config"}, {"", "invalid_config"}, {"[]", "invalid_config"}, {"null", "invalid_config"}, {"{", "invalid_config"}, {`{"v":1} {}`, "invalid_config"}, {`{"v":1} garbage`, "invalid_config"}} {
		_, got := ParseConfig([]byte(tt.input))
		if got != tt.code {
			t.Errorf("%s: %s != %s", tt.input, got, tt.code)
		}
	}
	c, code := ParseConfig([]byte(`{"v":1.0,"tokenCss":"./tokens.css","serve":["assets"]}`))
	if code != "" || c.V != 1 || c.TokenCSS != "./tokens.css" || len(c.Serve) != 1 || c.Serve[0] != "assets" {
		t.Fatalf("%+v %s", c, code)
	}
}
