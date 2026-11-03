package export

import (
	"path"
	"strings"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
)

// uses records, over the canvas and every stylesheet it reaches, which
// folders' style text puts each custom property into a real property.
// Chromium (measured in Electron 45) resolves a relative url() held in an
// unregistered custom property against the stylesheet whose var() does that,
// not where the property is declared. The record is by name only, ignoring
// selectors and the cascade, so it can list a folder whose rule never
// applies to the element; replaceCustom tolerates that by using the one
// candidate that exists.
type uses struct {
	dirs      map[string]map[string]bool // property → folders of its direct users
	users     map[string]map[string]bool // property → properties whose values name it
	urlSyntax map[string]bool
	seen      map[string]bool // stylesheets already read
}

func (u *uses) add(dir string, c canvas.CustomUse) {
	for name := range c.Used {
		if u.dirs[name] == nil {
			u.dirs[name] = map[string]bool{}
		}
		u.dirs[name][dir] = true
	}
	for from, names := range c.Hops {
		for name := range names {
			if u.users[name] == nil {
				u.users[name] = map[string]bool{}
			}
			u.users[name][from] = true
		}
	}
	for name := range c.URLSyntax {
		u.urlSyntax[name] = true
	}
}

// consumers returns the folders whose var() puts name into a real property,
// directly or through other custom properties, sorted.
func (u *uses) consumers(name string) []string {
	dirs := map[string]bool{}
	visited := map[string]bool{name: true}
	stack := []string{name}
	for len(stack) > 0 {
		n := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		for d := range u.dirs[n] {
			dirs[d] = true
		}
		for m := range u.users[n] {
			if !visited[m] {
				visited[m] = true
				stack = append(stack, m)
			}
		}
	}
	return keys(dirs)
}

// collectUses reads the canvas's style text and the stylesheets it reaches,
// before any rewrite, because a url() can be declared before its user.
func (in *inliner) collectUses(canvasPath string, src []byte) {
	in.uses = uses{dirs: map[string]map[string]bool{}, users: map[string]map[string]bool{}, urlSyntax: map[string]bool{}, seen: map[string]bool{}}
	dir := path.Dir(canvasPath)
	rewriteHTMLBody(src, func(kind refKind, href string) (string, bool) {
		if kind == kindStylesheet {
			in.collectSheet(dir, href)
		}
		return "", false
	}, func(text string, mode canvas.Mode) string {
		in.collectText(dir, text, mode)
		return text
	})
}

func (in *inliner) collectText(dir, text string, mode canvas.Mode) {
	in.uses.add(dir, canvas.CustomUses(text, mode))
	for _, r := range canvas.CSSRefs(text, mode) {
		if r.Import {
			in.collectSheet(dir, r.Value)
		}
	}
}

// collectSheet follows a stylesheet reference as inlineFile would, reading
// only what the app would serve as CSS.
func (in *inliner) collectSheet(base, href string) {
	if in.stopped() || classifyRef(kindStylesheet, href) != classInline {
		return
	}
	r, err := resolveAsset(in.root, in.scope, base, href)
	if err != nil {
		in.err = err
		return
	}
	if r.State != assetInside || in.uses.seen[r.Real] || !strings.HasPrefix(mimeType(r.Real), "text/css") {
		return
	}
	in.uses.seen[r.Real] = true
	b, err := in.read(r.Real)
	if err != nil {
		in.err = err
		return
	}
	if in.stopped() {
		return
	}
	in.collectText(path.Dir(r.Real), string(b), canvas.Stylesheet)
}

// replaceCustom resolves a url() held in a custom property from dirs, the
// folders that use the property. One existing served file is inlined.
func (in *inliner) replaceCustom(from string, direct bool, h, href string, dirs []string) (string, bool) {
	found := map[string]bool{}
	refusal := ""
	for _, d := range dirs {
		r, err := resolveAsset(in.root, in.scope, d, href)
		if err != nil {
			in.err = err
			return "", false
		}
		switch r.State {
		case assetInside:
			found[r.Real] = true
		case assetRefused:
			if refusal == "" {
				refusal = r.Reason
			}
		}
	}
	switch {
	case len(found) > 1:
		in.refuse(from, h, ReasonAmbiguous)
		return "", false
	case len(found) == 0:
		if refusal != "" {
			in.refuse(from, h, refusal)
		} else if direct {
			in.refuse(from, h, ReasonMissing)
		}
		return "", false
	}
	real := keys(found)[0]
	uri, _, err := in.inlineFile(real, kindAsset, nil)
	if err != nil {
		in.err = err
		return "", false
	}
	return uri + fragment(h), true
}
