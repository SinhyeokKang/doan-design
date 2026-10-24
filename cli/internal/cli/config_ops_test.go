package cli

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
)

func TestApplyConfigOps(t *testing.T) {
	base := repo.Config{V: 1, TokenCSS: "old.css", Serve: []string{"assets", "fonts"}}
	for _, tt := range []struct {
		name             string
		ops              configOps
		want             repo.Config
		changed, invalid bool
	}{
		{"read", configOps{}, base, false, false},
		{"set token", configOps{TokenCSS: "new.css", TokenCSSSet: true}, repo.Config{V: 1, TokenCSS: "new.css", Serve: base.Serve}, true, false},
		{"same token", configOps{TokenCSS: "old.css", TokenCSSSet: true}, base, false, false},
		{"clear token", configOps{ClearTokenCSS: true}, repo.Config{V: 1, Serve: base.Serve}, true, false},
		{"add and remove", configOps{AddServe: []string{"images", "images"}, RemoveServe: []string{"assets"}}, repo.Config{V: 1, TokenCSS: "old.css", Serve: []string{"fonts", "images"}}, true, false},
		{"duplicate and absent", configOps{AddServe: []string{"assets"}, RemoveServe: []string{"absent"}}, base, false, false},
		{"conflict", configOps{TokenCSSSet: true, TokenCSS: "new.css", ClearTokenCSS: true}, base, false, true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			before, _ := json.Marshal(base)
			got, changed, err := applyConfigOps(base, tt.ops)
			if (err != nil) != tt.invalid {
				t.Fatalf("error = %v", err)
			}
			if err == nil && (!reflect.DeepEqual(got, tt.want) || changed != tt.changed) {
				t.Fatalf("got %#v %v, want %#v %v", got, changed, tt.want, tt.changed)
			}
			after, _ := json.Marshal(base)
			if string(before) != string(after) {
				t.Fatal("mutated input")
			}
		})
	}
	got, changed, err := applyConfigOps(repo.Config{V: 1}, configOps{ClearTokenCSS: true})
	if err != nil || changed || got.TokenCSS != "" {
		t.Fatal(got, changed, err)
	}
}

func TestConfigSerializationMatchesInit(t *testing.T) {
	root := initialized(t)
	got, _, failure := applyConfigOps(repo.Config{V: 1, TokenCSS: "tokens.css"}, configOps{ClearTokenCSS: true})
	if failure != nil {
		t.Fatal(failure)
	}
	data, err := json.MarshalIndent(got, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if string(data)+"\n" != readFile(t, root, ".doan/config.json") {
		t.Fatal(string(data))
	}
	data, err = json.MarshalIndent(repo.Config{V: 1, TokenCSS: "tokens.css", Serve: []string{"assets"}}, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "{\n  \"v\": 1,\n  \"tokenCss\": \"tokens.css\",\n  \"serve\": [\n    \"assets\"\n  ]\n}" {
		t.Fatal(string(data))
	}
}
