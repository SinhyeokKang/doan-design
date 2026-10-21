package cli

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestMCPArgv(t *testing.T) {
	for _, tt := range []struct {
		tool, raw string
		want      []string
	}{
		{"init", `{}`, []string{"init", "--json"}},
		{"init", `{"repo":"/r","tokenCss":"styles/tokens.css"}`, []string{"init", "--repo=/r", "--token-css=styles/tokens.css", "--json"}},
		{"init", `{"tokenCss":""}`, []string{"init", "--token-css=", "--json"}},
		{"init", `{"tokenCss":"-x"}`, []string{"init", "--token-css=-x", "--json"}},
		{"ls", ``, []string{"ls", "--json"}},
		{"ls", `null`, []string{"ls", "--json"}},
		{"ls", `{"repo":"/r=x"}`, []string{"ls", "--repo=/r=x", "--json"}},
		{"check", `{}`, []string{"check", "--json"}},
		{"check", `{"repo":"/r"}`, []string{"check", "--repo=/r", "--json"}},
		{"comments", `{}`, []string{"comments", "--json"}},
		{"comments", `{"repo":"/r","canvas":"foo"}`, []string{"comments", "--repo=/r", "--canvas=foo", "--json"}},
		{"comments", `{"canvas":""}`, []string{"comments", "--canvas=", "--json"}},
		{"comments", `{"canvas":"--json"}`, []string{"comments", "--canvas=--json", "--json"}},
		{"resolve_comments", `{"ids":["b","-a","a","--"],"agent":"codex"}`, []string{"comment", "resolve", "--agent=codex", "--json", "--", "b", "-a", "a", "--"}},
		{"resolve_comments", `{"repo":"/r","ids":["x"],"agent":"-a"}`, []string{"comment", "resolve", "--repo=/r", "--agent=-a", "--json", "--", "x"}},
		// Empty ids and invalid agent names are left to the command body so the message matches the CLI.
		{"resolve_comments", `{"ids":[],"agent":"Claude"}`, []string{"comment", "resolve", "--agent=Claude", "--json", "--"}},
		{"resolve_comments", `{"ids":["x"]}`, []string{"comment", "resolve", "--json", "--", "x"}},
		{"skill", ``, []string{"skill", "--json"}},
		{"skill", `{}`, []string{"skill", "--json"}},
	} {
		got, e := argv(tt.tool, json.RawMessage(tt.raw))
		if e != nil || !reflect.DeepEqual(got, tt.want) {
			t.Errorf("%s %s: %q %v, want %q", tt.tool, tt.raw, got, e, tt.want)
		}
	}
}

func TestMCPArgvRejects(t *testing.T) {
	for _, tt := range []struct{ tool, raw string }{
		{"init", `{"repo":"rel"}`},
		{"ls", `{"repo":"./rel"}`},
		{"check", `{"repo":""}`},
		{"comments", `{"repo":"../x"}`},
		{"resolve_comments", `{"repo":"rel","ids":["x"],"agent":"codex"}`},
		{"init", `{"token_css":"x"}`},
		{"ls", `{"canvas":"foo"}`},
		{"check", `{"json":true}`},
		{"comments", `{"agent":"codex"}`},
		{"resolve_comments", `{"ids":["x"],"agent":"codex","all":true}`},
		{"skill", `{"repo":"/r"}`},
		{"ls", `{"repo":1}`},
		{"ls", `{"repo":null}`},
		{"init", `{"tokenCss":false}`},
		{"comments", `{"canvas":["foo"]}`},
		{"resolve_comments", `{"ids":"x","agent":"codex"}`},
		{"resolve_comments", `{"ids":[1],"agent":"codex"}`},
		{"resolve_comments", `{"ids":null,"agent":"codex"}`},
		{"resolve_comments", `{"ids":["x"],"agent":1}`},
		{"ls", `[]`},
		{"ls", `"x"`},
		{"skill", `1`},
	} {
		got, e := argv(tt.tool, json.RawMessage(tt.raw))
		if e == nil || e.Code != "usage_error" || got != nil {
			t.Errorf("%s %s: %q %v", tt.tool, tt.raw, got, e)
		}
	}
}
