package canvas

import (
	"reflect"
	"testing"
)

func TestUseNotInline(t *testing.T) {
	for _, tt := range []struct {
		ref  string
		want bool
	}{
		{"#icon", false},
		{" \t#icon\n", false},
		{"#missing", false},
		{"", false},
		{" \n", false},
		{"../assets/sprite.svg#icon", true},
		{"sprite.svg", true},
		{" sprite.svg#icon ", true},
		{"data:image/svg+xml,%3Csvg/%3E#icon", true},
		{"https://cdn.example.com/icons.svg#a", true},
		{"HTTP://cdn.example.com/icons.svg#a", true},
		{"//cdn.example.com/icons.svg#a", true},
	} {
		if got := UseNotInline(tt.ref); got != tt.want {
			t.Errorf("UseNotInline(%q) = %v, want %v", tt.ref, got, tt.want)
		}
	}
}

// The app draws a <use> only when it names a fragment of the canvas; every
// other reference is listed as written, in document order.
func TestParseUseRefs(t *testing.T) {
	for _, tt := range []struct {
		name, html string
		want       []string
	}{
		{"local href", `<svg><use href="../assets/sprite.svg#icon"/></svg>`, []string{"../assets/sprite.svg#icon"}},
		{"xlink href in the xlink namespace", `<svg xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="../assets/sprite.svg#icon"></use></svg>`, []string{"../assets/sprite.svg#icon"}},
		{"data url", `<svg><use href="data:image/svg+xml,%3Csvg/%3E#icon"/></svg>`, []string{"data:image/svg+xml,%3Csvg/%3E#icon"}},
		{"https url", `<svg><use href="https://cdn.example.com/i.svg#a"/></svg>`, []string{"https://cdn.example.com/i.svg#a"}},
		{"http url", `<svg><use href="http://cdn.example.com/i.svg#a"/></svg>`, []string{"http://cdn.example.com/i.svg#a"}},
		{"protocol-relative url", `<svg><use href="//cdn.example.com/i.svg#a"/></svg>`, []string{"//cdn.example.com/i.svg#a"}},
		{"surrounding whitespace is kept as written", `<svg><use href=" sprite.svg#a "/></svg>`, []string{" sprite.svg#a "}},
		{"whitespace around a fragment", `<svg><use href=" #a "/></svg>`, nil},
		{"empty value", `<svg><use href=""/><use xlink:href=" "/></svg>`, nil},
		{"no reference", `<svg><use/></svg>`, nil},
		{"fragment not in the document", `<svg><use href="#missing"/></svg>`, nil},
		{"html use outside svg is ignored", `<use href="sprite.svg#a"></use><div><use href="b.svg#b"></use></div>`, nil},
		{"href wins over xlink href", `<svg><use href="#a" xlink:href="sprite.svg#b"/><use href="sprite.svg#c" xlink:href="#d"/></svg>`, []string{"sprite.svg#c"}},
		{"empty href still wins over xlink href", `<svg><use href="" xlink:href="sprite.svg#b"/></svg>`, nil},
		{"duplicate href keeps the first", `<svg><use href="#a" href="sprite.svg#b"/></svg>`, nil},
		{"empty canvas", ``, nil},
		{"canvas without svg", `<p>No icons.</p>`, nil},
		{"use in a template is inert", `<template><svg><use href="sprite.svg#a"/></svg></template>`, nil},
		{"top-level self-closing template", `<template/><svg><use href="in.svg#a"/></svg></template><svg><use href="after.svg#a"/></svg>`, []string{"after.svg#a"}},
		{"nested self-closing template", `<template><template/></template><svg><use href="in.svg#a"/></svg></template><svg><use href="after.svg#a"/></svg>`, []string{"after.svg#a"}},
		{"document order", `<svg><use href="b.svg#b"/><g><use href="a.svg#a"/></g></svg><svg><use href="#local"/><use href="b.svg#b"/></svg>`, []string{"b.svg#b", "a.svg#a", "b.svg#b"}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			c := mustParse(t, "x", []byte(tt.html))
			if len(c.UseRefs) == 0 && len(tt.want) == 0 {
				return
			}
			if !reflect.DeepEqual(c.UseRefs, tt.want) {
				t.Fatalf("UseRefs = %q, want %q", c.UseRefs, tt.want)
			}
		})
	}
}

// A <use> of an external URL is reported by svg_use_not_inline alone, so it
// is not an external URL of the canvas; <image> still is.
func TestUseURLIsNotAnExternalURL(t *testing.T) {
	c := mustParse(t, "x", []byte(`<svg><use href="https://cdn/u.svg#a"/><use xlink:href="//cdn/x.svg#a"/><image href="https://cdn/i.png"/></svg>`))
	if !reflect.DeepEqual(c.ExternalURLs, []string{"https://cdn/i.png"}) {
		t.Fatalf("ExternalURLs = %q", c.ExternalURLs)
	}
	if !reflect.DeepEqual(c.UseRefs, []string{"https://cdn/u.svg#a", "//cdn/x.svg#a"}) {
		t.Fatalf("UseRefs = %q", c.UseRefs)
	}
}
