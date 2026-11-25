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

// The browser drops an @property rule without inherits, or without initial-value for any syntax but "*"; the
// property then stays unregistered and its url() resolves from its users.
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

// A rule counts as a user only when its rightmost compound can match an element of a script-free canvas, since the
// app never applies a rule whose element the canvas lacks. Whatever cannot be judged statically counts.
func TestCustomUsersCountOnlyRulesACanvasElementCanMatch(t *testing.T) {
	const page = `<div class="card" id="Hero"><span class="Icon"></span><svg><rect/></svg></div>`
	for _, tt := range []struct {
		name, page, css string
		want            bool
	}{
		{"a class no element has", page, `.btn{mask:var(--i)}`, false},
		{"a class an element has", page, `.card{mask:var(--i)}`, true},
		{"class names compare without case", page, `.icon{mask:var(--i)}`, true},
		{"only the rightmost compound must match", page, `.btn .card{mask:var(--i)}`, true},
		{"a rightmost compound no element matches", page, `.card .btn{mask:var(--i)}`, false},
		{"a child combinator", page, `.card>.btn{mask:var(--i)}`, false},
		{"any selector in a list", page, `.btn,.card{mask:var(--i)}`, true},
		{"every class of a compound", page, `.card.btn{mask:var(--i)}`, false},
		{"a dynamic pseudo-class keeps the compound", page, `.btn:hover{mask:var(--i)}`, false},
		{"a dynamic pseudo-class on a present class", page, `.card:hover{mask:var(--i)}`, true},
		{"a pseudo-element keeps the compound", page, `.btn::before{mask:var(--i)}`, false},
		{"a functional pseudo-class is not judged", page, `:is(.btn){mask:var(--i)}`, true},
		{"a negation keeps the rest of the compound", page, `.btn:not(.card){mask:var(--i)}`, false},
		{"a type no element has", page, `section{mask:var(--i)}`, false},
		{"a type an element has", page, `DIV{mask:var(--i)}`, true},
		{"an svg type", page, `rect{mask:var(--i)}`, true},
		{"the parser's implied body", page, `body{mask:var(--i)}`, true},
		{"a type with an absent class", page, `div.btn{mask:var(--i)}`, false},
		{"the universal selector", page, `.btn>*{mask:var(--i)}`, true},
		{"an id no element has", page, `#nav{mask:var(--i)}`, false},
		{"an id an element has", page, `#hero{mask:var(--i)}`, true},
		{"an attribute selector keeps the compound", page, `.btn[data-x="a b"]{mask:var(--i)}`, false},
		{"an absent class inside @media", page, `@media (min-width:1px){.btn{mask:var(--i)}}`, false},
		{"a present class inside @media", page, `@media (min-width:1px){.card{mask:var(--i)}}`, true},
		{"keyframes count", page, `@keyframes k{from{mask:var(--i)}}`, true},
		{"an unknown at-rule counts", page, `@page{.btn{mask:var(--i)}}`, true},
		{"a nested rule with an absent class", page, `.card{.btn{mask:var(--i)}}`, false},
		{"a nesting selector is not judged", page, `.btn{&:hover{mask:var(--i)}}`, true},
		{"an escape is not judged", page, `.a\:b{mask:var(--i)}`, true},
		{"a namespace is not judged", page, `svg|rect{mask:var(--i)}`, true},
		{"a comment inside a pseudo-class is not judged", page, `:/**/root{mask:var(--i)}`, true},
		{"a comment inside a class selector is not judged", page, `./**/btn, ./**/card{mask:var(--i)}`, true},
		{"an editable element makes every rule count", page + `<section contenteditable>x</section>`, `.btn{mask:var(--i)}`, true},
		{"user-modify makes every rule count", page, `.card{-webkit-user-modify:read-write} .btn{mask:var(--i)}`, true},
		{"an escaped property name makes every rule count", page, `.card{-webkit-user-modif\79:read-write} .btn{mask:var(--i)}`, true},
		{"a hop in a rule no element matches", page, `.btn{--j:var(--i)} .card{mask:var(--j)}`, false},
		{"a hop in a rule an element matches", page, `.card{--j:var(--i)} .icon{mask:var(--j)}`, true},
		{"an element inside a template counts", `<div class="card"></div><template><i class="btn"></i></template>`, `.btn{mask:var(--i)}`, true},
		{"a script makes every rule count", page + `<script></script>`, `.btn{mask:var(--i)}`, true},
		{"an event handler makes every rule count", `<div onclick="x()"></div>`, `.btn{mask:var(--i)}`, true},
		{"a javascript url makes every rule count", `<a href=" JavaScript:x()"></a>`, `.btn{mask:var(--i)}`, true},
		{"an animated class makes every rule count", `<svg><set attributeName="class" to="btn"/></svg>`, `.btn{mask:var(--i)}`, true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			u := &CustomUsers{Elements: mustParse(t, "c", []byte(tt.page)).Elements}
			u.Add(".doan/canvases", CustomUses(`.card{mask:var(--i)}`, Stylesheet))
			u.Add(".doan/ds", CustomUses(tt.css, Stylesheet))
			if got := u.Ambiguous("--i", "x.svg"); got != tt.want {
				t.Fatalf("Ambiguous = %v, want %v", got, tt.want)
			}
		})
	}
}

// Style attributes sit on an element the canvas has, so their uses always count.
// A style attribute's user-modify makes the canvas editable too.
func TestCustomUsersEditableStyleAttribute(t *testing.T) {
	c := mustParse(t, "c", []byte(`<div class="card" style="-webkit-user-modif\79:read-write"></div>`))
	u := &CustomUsers{Elements: c.Elements}
	u.Add(".doan/canvases", c.Custom.Uses)
	u.Add(".doan/canvases", CustomUses(`.card{mask:var(--i)}`, Stylesheet))
	u.Add(".doan/ds", CustomUses(`div.btn{mask:var(--i)}`, Stylesheet))
	if !u.Ambiguous("--i", "x.svg") {
		t.Fatal("an editable style attribute did not make every rule count")
	}
}

func TestCustomUsersStyleAttributesAlwaysCount(t *testing.T) {
	u := &CustomUsers{Elements: mustParse(t, "c", []byte(`<div></div>`)).Elements}
	u.Add(".doan/canvases", CustomUses(`mask:var(--i)`, Declarations))
	u.Add(".doan/ds", CustomUses(`div{mask:var(--i)}`, Stylesheet))
	if !u.Ambiguous("--i", "x.svg") {
		t.Fatal("a style attribute use did not count")
	}
}

// ElementsOf reads the same elements Parse does, for export.
func TestElementsOfMatchesParse(t *testing.T) {
	for _, page := range []string{`<div class="card"></div>`, `<script></script>`} {
		if got, want := ElementsOf([]byte(page)), mustParse(t, "c", []byte(page)).Elements; !reflect.DeepEqual(got, want) {
			t.Errorf("%s: ElementsOf = %+v, Parse = %+v", page, got, want)
		}
	}
}
