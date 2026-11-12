package canvas

import (
	"reflect"
	"testing"
)

func customValues(refs []CSSRef) [][2]string {
	var out [][2]string
	for _, r := range refs {
		out = append(out, [2]string{r.Custom, r.Value})
	}
	return out
}

// ScanCustom keeps only the url()s a custom property value holds, decoded,
// with what the text does with custom properties.
func TestScanCustom(t *testing.T) {
	got := ScanCustom(`@import "a.css";
@property --reg { syntax: "<url>"; inherits: true; initial-value: url(init.svg) }
:root { --i: url( "i.svg" ); --j: var(--i); --k: var(--nope, url(k\.svg)); color: red }
.x { mask: var(--j) url(plain.svg); background: url(bg.png) }`, Stylesheet)
	if want := [][2]string{{"--i", "i.svg"}, {"--k", "k.svg"}}; !reflect.DeepEqual(customValues(got.URLs), want) {
		t.Errorf("URLs = %v, want %v", customValues(got.URLs), want)
	}
	if !got.Uses.Used["--j"] || len(got.Uses.Used) != 1 {
		t.Errorf("Used = %v", got.Uses.Used)
	}
	if !got.Uses.Hops["--j"]["--i"] || !got.Uses.Hops["--k"]["--nope"] {
		t.Errorf("Hops = %v", got.Uses.Hops)
	}
	if !got.Uses.URLSyntax["--reg"] {
		t.Errorf("URLSyntax = %v", got.Uses.URLSyntax)
	}
	attr := ScanCustom(`--i:url(i.svg); mask: var(--i)`, Declarations)
	if want := [][2]string{{"--i", "i.svg"}}; !reflect.DeepEqual(customValues(attr.URLs), want) || !attr.Uses.Used["--i"] {
		t.Errorf("declarations: %+v", attr)
	}
}

// Parse merges the canvas's own <style> elements and style attributes,
// outside <template>, into Custom.
func TestParseCustom(t *testing.T) {
	c := mustParse(t, "x", []byte(`<style>:root{--a:url(a.svg)}</style>
<div style="--b:url(b.svg);mask:var(--a)"></div>
<svg><style>.s{fill:var(--c)}</style></svg>
<template><style>.t{mask:var(--t)}</style><div style="--t:url(t.svg)"></div></template>
<template/><style>.u{mask:var(--u)}</style></template>`))
	if want := [][2]string{{"--a", "a.svg"}, {"--b", "b.svg"}}; !reflect.DeepEqual(customValues(c.Custom.URLs), want) {
		t.Errorf("URLs = %v, want %v", customValues(c.Custom.URLs), want)
	}
	if want := map[string]bool{"--a": true, "--c": true}; !reflect.DeepEqual(c.Custom.Uses.Used, want) {
		t.Errorf("Used = %v, want %v", c.Custom.Uses.Used, want)
	}
}

func users(add map[string]string) *CustomUsers {
	u := &CustomUsers{}
	for dir, text := range add {
		u.Add(dir, CustomUses(text, Stylesheet))
	}
	return u
}

func TestCustomUsersConsumers(t *testing.T) {
	u := users(map[string]string{
		".doan/canvases": `.x{mask:var(--i)}`,
		".doan/ds":       `.y{background:var(--j)} .z{--j:var(--i)}`,
		"styles":         `.c{--a:var(--b)} .d{--b:var(--a)} .e{mask:var(--a)} @property --reg{syntax:"<url> | none";inherits:false;initial-value:none} @property --any{syntax:"*";inherits:false}`,
	})
	if got, want := u.Consumers("--i"), []string{".doan/canvases", ".doan/ds"}; !reflect.DeepEqual(got, want) {
		t.Errorf("--i consumers = %q, want %q", got, want)
	}
	// A cycle of custom properties ends; both reach the one real use.
	for _, name := range []string{"--a", "--b"} {
		if got, want := u.Consumers(name), []string{"styles"}; !reflect.DeepEqual(got, want) {
			t.Errorf("%s consumers = %q, want %q", name, got, want)
		}
	}
	if got := u.Consumers("--unused"); len(got) != 0 {
		t.Errorf("--unused consumers = %q", got)
	}
	if !u.Registered("--reg") || u.Registered("--any") || u.Registered("--i") {
		t.Errorf("registered: reg %v any %v i %v", u.Registered("--reg"), u.Registered("--any"), u.Registered("--i"))
	}
}

func TestCustomURLPaths(t *testing.T) {
	for _, tt := range []struct {
		dirs []string
		href string
		want []string
	}{
		{[]string{".doan/canvases", ".doan/ds"}, "../assets/x.svg", []string{".doan/assets/x.svg"}},
		{[]string{".doan/canvases", ".doan/ds"}, "icons/x.svg", []string{".doan/canvases/icons/x.svg", ".doan/ds/icons/x.svg"}},
		{[]string{"styles"}, "./i.svg?v=1#frag", []string{"styles/i.svg"}},
		{[]string{"styles", "styles/sub"}, "../i.svg", []string{"i.svg", "styles/i.svg"}},
		{[]string{"a"}, "%ED%95%9C.svg", []string{"a/한.svg"}},
		{[]string{"a", "b"}, "/abs.svg", nil},
		{[]string{"a", "b"}, "data:image/svg+xml,%3Csvg/%3E", nil},
		{[]string{"a", "b"}, "https://cdn.example.com/x.svg", nil},
		{[]string{"a", "b"}, "//cdn.example.com/x.svg", nil},
		{[]string{"a", "b"}, "", nil},
		{[]string{"a", "b"}, "#frag", nil},
		{nil, "x.svg", nil},
	} {
		if got := CustomURLPaths(tt.dirs, tt.href); !reflect.DeepEqual(got, tt.want) {
			t.Errorf("CustomURLPaths(%q, %q) = %q, want %q", tt.dirs, tt.href, got, tt.want)
		}
	}
}

func TestCustomUsersAmbiguous(t *testing.T) {
	for _, tt := range []struct {
		name  string
		users map[string]string
		prop  string
		href  string
		want  bool
	}{
		{"two folders resolve to two paths", map[string]string{".doan/canvases": `.x{mask:var(--i)}`, ".doan/ds": `.y{mask:var(--i)}`}, "--i", "icons/x.svg", true},
		{"two folders resolve to the same path", map[string]string{".doan/canvases": `.x{mask:var(--i)}`, ".doan/ds": `.y{mask:var(--i)}`}, "--i", "../assets/x.svg", false},
		{"one folder", map[string]string{".doan/assets/sf-ds": `.x{mask:var(--i)}`}, "--i", "icons/x.svg", false},
		{"no user", map[string]string{".doan/canvases": `.x{mask:var(--j)}`}, "--i", "icons/x.svg", false},
		{"through a chain", map[string]string{"a": `.x{--j:var(--i)} .y{mask:var(--j)}`, "b": `.z{mask:var(--i)}`}, "--i", "x.svg", true},
		{"through a cycle", map[string]string{"a": `.x{--j:var(--i)} .y{--i:var(--j)} .w{mask:var(--j)}`, "b": `.z{mask:var(--i)}`}, "--i", "x.svg", true},
		{"registered with url syntax", map[string]string{"a": `@property --i{syntax:"<url>";inherits:true;initial-value:url(x.svg)} .x{mask:var(--i)}`, "b": `.y{mask:var(--i)}`}, "--i", "x.svg", false},
		{"an invalid registration without inherits", map[string]string{"a": `@property --i{syntax:"<url>";initial-value:url(x.svg)} .x{mask:var(--i)}`, "b": `.y{mask:var(--i)}`}, "--i", "x.svg", true},
		{"an invalid registration without initial-value", map[string]string{"a": `@property --i{syntax:"<url>";inherits:true} .x{mask:var(--i)}`, "b": `.y{mask:var(--i)}`}, "--i", "x.svg", true},
		{"registered with universal syntax", map[string]string{"a": `@property --i{syntax:"*"} .x{mask:var(--i)}`, "b": `.y{mask:var(--i)}`}, "--i", "x.svg", true},
		{"absolute path", map[string]string{"a": `.x{mask:var(--i)}`, "b": `.y{mask:var(--i)}`}, "--i", "/x.svg", false},
		{"data url", map[string]string{"a": `.x{mask:var(--i)}`, "b": `.y{mask:var(--i)}`}, "--i", "data:image/svg+xml,%3Csvg/%3E", false},
		{"http url", map[string]string{"a": `.x{mask:var(--i)}`, "b": `.y{mask:var(--i)}`}, "--i", "http://cdn.example.com/x.svg", false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if got := users(tt.users).Ambiguous(tt.prop, tt.href); got != tt.want {
				t.Fatalf("Ambiguous = %v, want %v", got, tt.want)
			}
		})
	}
}

// The browser drops an @property rule without inherits, or, for any syntax
// but the universal one, without initial-value; the property then stays
// unregistered and its url() resolves from its users.
func TestCustomUsesRegistersOnlyValidURLProperties(t *testing.T) {
	for _, tt := range []struct {
		name, css string
		want      bool
	}{
		{"syntax, inherits and initial-value", `@property --i{syntax:"<url>";inherits:true;initial-value:url(i.svg)}`, true},
		{"a url alternative", `@property --i{syntax:'<url> | none';inherits:false;initial-value:none}`, true},
		{"descriptor names in any case", `@property --i{SYNTAX:"<url>";Inherits:true;Initial-Value:none}`, true},
		{"missing inherits", `@property --i{syntax:"<url>";initial-value:url(i.svg)}`, false},
		{"missing initial-value", `@property --i{syntax:"<url>";inherits:true}`, false},
		{"missing syntax", `@property --i{inherits:true;initial-value:url(i.svg)}`, false},
		{"syntax without url", `@property --i{syntax:"<number>";inherits:true;initial-value:0}`, false},
		{"universal syntax", `@property --i{syntax:"*";inherits:true;initial-value:url(i.svg)}`, false},
		{"descriptors outside the rule", `@property --i{syntax:"<url>"} :root{inherits:true;initial-value:none}`, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if got := CustomUses(tt.css, Stylesheet).URLSyntax["--i"]; got != tt.want {
				t.Fatalf("registered = %v, want %v", got, tt.want)
			}
		})
	}
}
