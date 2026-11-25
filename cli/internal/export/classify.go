package export

import "github.com/SinhyeokKang/doan-design/cli/internal/canvas"

// refKind is what a reference does in the page.
type refKind int

const (
	kindAsset      refKind = iota // loaded as a subresource
	kindStylesheet                // loaded as CSS: <link rel=stylesheet>, @import
	kindLink                      // navigation: <a href>, <form action>, other <link> rels
	kindFrame                     // a nested document: iframe, frame, object, embed
	kindUse                       // SVG <use href>: the app draws only a fragment of the canvas
)

type refClass int

const (
	classIgnore   refClass = iota // not a file reference: empty, fragment, data:, other schemes
	classInline                   // a local file to resolve and inline
	classLink                     // a local navigation target, left as written
	classExternal                 // http:, https: or `//`, left as a link
	classRefuse                   // a local document in a frame (out of scope)
)

func classifyRef(kind refKind, href string) refClass {
	if canvas.IsExternal(href) {
		if kind == kindLink {
			return classIgnore
		}
		return classExternal
	}
	if _, ok := canvas.LocalPath(href); !ok {
		return classIgnore
	}
	switch kind {
	case kindLink:
		return classLink
	case kindFrame:
		return classRefuse
	}
	return classInline
}
