package export

import (
	"path"
	"strings"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
)

// collectUses records which folders use each custom property (canvas.CustomUsers, as doan check builds it) before any
// rewrite, because a url() can be declared before its user. The canvas's elements are parsed only when some text uses one.
func (in *inliner) collectUses(canvasPath string, src []byte) {
	in.uses = canvas.CustomUsers{}
	in.pending = nil
	in.collected = map[string]bool{}
	dir := path.Dir(canvasPath)
	if in.based != "" {
		dir = movedBase
	}
	rewriteHTML(src, func(kind refKind, href string) (string, bool) {
		if kind == kindStylesheet {
			in.collectSheet(dir, href)
		}
		return "", false
	}, func(text string, mode canvas.Mode) string {
		in.collectText(dir, text, mode)
		return text
	})
	for _, p := range in.pending {
		if len(p.use.Used) > 0 || len(p.use.Hops) > 0 {
			in.uses.Elements = canvas.ElementsOf(src)
			break
		}
	}
	for _, p := range in.pending {
		in.uses.Add(p.dir, p.use)
	}
	in.pending = nil
}

// pendingUse is one style text's custom property use, kept until the
// canvas's elements are known.
type pendingUse struct {
	dir string
	use canvas.CustomUse
}

func (in *inliner) collectText(dir, text string, mode canvas.Mode) {
	in.pending = append(in.pending, pendingUse{dir, canvas.CustomUses(text, mode)})
	for _, r := range canvas.CSSRefs(text, mode) {
		if r.Import {
			in.collectSheet(dir, r.Value)
		}
	}
}

// collectSheet follows a stylesheet reference as inlineFile would, reading
// only what the app would serve as CSS.
func (in *inliner) collectSheet(base, href string) {
	// Under a moving base the canvas's stylesheets are refused, not read.
	if in.stopped() || base == movedBase || classifyRef(kindStylesheet, href) != classInline {
		return
	}
	r, err := resolveAsset(in.resolver, in.root, in.scope, base, href)
	if err != nil {
		in.err = err
		return
	}
	if r.State != assetInside || in.collected[r.Real] || !strings.HasPrefix(mimeType(r.Real), "text/css") {
		return
	}
	in.collected[r.Real] = true
	b, err := in.read(r.Real)
	if err != nil {
		in.err = err
		return
	}
	if in.stopped() {
		return
	}
	in.collectText(path.Dir(r.Real), b, canvas.Stylesheet)
}

// replaceCustom resolves a url() held in custom property custom from dirs, the folders that use it. Different paths are
// refused whether or not those files exist, as doan check warns.
func (in *inliner) replaceCustom(from string, direct bool, h, href, custom string, dirs []string) (string, bool) {
	for _, d := range dirs {
		if d == movedBase {
			in.refuse(from, h, ReasonBase)
			return "", false
		}
	}
	if in.uses.Ambiguous(custom, href) {
		in.refuse(from, h, ReasonAmbiguous)
		return "", false
	}
	r, err := resolveAsset(in.resolver, in.root, in.scope, dirs[0], href)
	if err != nil {
		in.err = err
		return "", false
	}
	switch r.State {
	case assetRefused:
		in.refuse(from, h, r.Reason)
	case assetMissing:
		if direct {
			in.refuse(from, h, ReasonMissing)
		}
	case assetInside:
		uri, _, err := in.inlineFile(r.Real, kindAsset, nil)
		if err != nil {
			in.err = err
			return "", false
		}
		return uri + fragment(h), true
	}
	return "", false
}
