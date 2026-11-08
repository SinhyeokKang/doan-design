package export

import (
	"bytes"
	"strings"

	"golang.org/x/net/html"
)

// movedBase stands for the canvas folder in the custom property use record
// when a <base href> moves the folder: a property the canvas itself uses
// then resolves against a base export does not follow. No folder path holds
// a NUL byte.
const movedBase = "\x00base"

// firstBaseHref returns the href of the first <base> outside <template>
// that has one, decoded as the parser decodes attribute values. A <base>
// inside inline <svg> or <math> counts too, though the browser ignores it
// there: the tokenizer does not track foreign content, and the cost is an
// unneeded refusal, not a wrong file.
func firstBaseHref(src []byte) (string, bool) {
	z := html.NewTokenizer(bytes.NewReader(src))
	template := 0
	for {
		tt := z.Next()
		switch tt {
		case html.ErrorToken:
			return "", false
		case html.StartTagToken, html.SelfClosingTagToken, html.EndTagToken:
		default:
			continue
		}
		tok := z.Token()
		if tok.Data == "template" {
			// The parser ignores the self-closing flag on <template>, at any
			// depth: <template/> opens one too.
			if tt == html.EndTagToken {
				if template > 0 {
					template--
				}
			} else {
				template++
			}
			continue
		}
		if template > 0 || tt == html.EndTagToken || tok.Data != "base" {
			continue
		}
		for _, a := range tok.Attr {
			if a.Key == "href" {
				return a.Val, true
			}
		}
	}
}

// baseMoves reports whether a base href resolves relative references from
// anywhere but the canvas folder. Only an empty value, "." or "./", or one
// file name in that folder (after an optional "./") keeps it; everything
// else moves it, including values that lead back to the same folder, which
// is simpler to refuse than to prove.
func baseMoves(href string) bool {
	// The URL parser drops tab and newline anywhere in the value and reads
	// %2E as a dot segment.
	h := trimURL(strings.NewReplacer("\t", "", "\n", "", "\r", "").Replace(href))
	h = strings.NewReplacer("%2e", ".", "%2E", ".").Replace(h)
	if i := strings.IndexAny(h, "?#"); i >= 0 {
		h = h[:i]
	}
	h = strings.TrimPrefix(h, "./")
	if h == "" || h == "." {
		return false
	}
	// The URL parser reads "\" as "/", and ":" may start a scheme.
	return strings.ContainsAny(h, `/\:`) || h == ".."
}

// dropBaseHref returns a <base> start tag without its href attributes, and
// false when it has none. Every reference in the result is a data URI, so
// the base has no use there.
func dropBaseHref(tok html.Token) (html.Token, bool) {
	kept := tok
	kept.Attr = nil
	for _, a := range tok.Attr {
		if a.Key != "href" {
			kept.Attr = append(kept.Attr, a)
		}
	}
	return kept, len(kept.Attr) < len(tok.Attr)
}
