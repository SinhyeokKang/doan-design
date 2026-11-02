package export

import (
	"strings"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
)

// refKind is what a reference does in the page.
type refKind int

const (
	kindAsset      refKind = iota // loaded as a subresource
	kindStylesheet                // loaded as CSS: <link rel=stylesheet>, @import
	kindLink                      // navigation: <a href>, <form action>, other <link> rels
	kindFrame                     // a nested document: iframe, frame, object, embed
	kindUse                       // SVG <use href>: a document fragment, which cannot be a data: URL
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

// trimURL strips what the URL parser strips: leading and trailing C0 controls and spaces.
func trimURL(s string) string {
	return strings.TrimFunc(s, func(r rune) bool { return r <= 32 })
}
