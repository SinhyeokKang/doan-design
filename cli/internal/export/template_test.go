package export

import (
	"reflect"
	"strings"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/export/exporttest"
)

// The HTML parser opens a template on <template/> at any depth (it ignores
// the self-closing flag). Inert CSS inside the outer template must not count
// as a user of a custom property, or the active url() resolves from the
// wrong folder and a file the app would not load is inlined.
func TestInlineInertTemplateDoesNotUseACustomProperty(t *testing.T) {
	root := exporttest.Seed(t)
	exporttest.Put(t, root, ".doan/canvases/icon.svg", `<svg xmlns="http://www.w3.org/2000/svg"/>`)
	exporttest.Put(t, root, ".doan/assets/user.css", `.real { mask:var(--icon) }`)
	for _, c := range []struct{ name, inert string }{
		{"control", ""},
		{"nested self-closing template", `<template><template/></template><style>.inert { mask:var(--icon) }</style><base href="../elsewhere/"></template>`},
		{"self-closing template", `<template/><style>.inert { mask:var(--icon) }</style><base href="../elsewhere/"></template>`},
	} {
		exporttest.Put(t, root, movedCanvas, `<!doctype html><html><head><meta name="doan:width" content="800">`+c.inert+
			`<base href="./"><link rel="stylesheet" href="../assets/user.css"></head><body><div class="real" style="--icon:url(icon.svg)"></div></body></html>`)
		res := inlineSeed(t, root, movedCanvas)
		if want := []Refusal{{movedCanvas, "icon.svg", ReasonMissing}}; !reflect.DeepEqual(res.Refused, want) {
			t.Errorf("%s: refused %+v, want %+v", c.name, res.Refused, want)
		}
		for _, a := range res.Assets {
			if a.Path == ".doan/canvases/icon.svg" {
				t.Errorf("%s: inlined %s", c.name, a.Path)
			}
		}
	}
}

// Everything up to the end tag that closes the outermost template stays as
// written, however the templates inside it are spelled.
func TestRewriteKeepsSelfClosingTemplateContent(t *testing.T) {
	for _, src := range []string{
		`<template><template/></template><img src="in.png"></template><img src="after.png">`,
		`<template/><template/></template><img src="in.png"></template><img src="after.png">`,
		`<template><template><template/></template></template><img src="in.png"></template><img src="after.png">`,
	} {
		got := string(rewriteHTML([]byte(src), func(_ refKind, href string) (string, bool) { return "N[" + href + "]", true }, keepCSS))
		want := strings.Replace(src, `"after.png"`, `"N[after.png]"`, 1)
		if got != want {
			t.Errorf("rewriteHTML(%s) =\n%s\nwant\n%s", src, got, want)
		}
	}
}
