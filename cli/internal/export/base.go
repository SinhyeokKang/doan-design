package export

import (
	"bytes"
	"strings"

	"golang.org/x/net/html"
)

// movedBase stands for the canvas folder in the custom property use record when a <base href> moves it: a property
// the canvas uses then resolves against a base export does not follow. No folder path holds a NUL byte.
const movedBase = "\x00base"

// templateTag follows <template> nesting as the HTML parser does (self-closing ignored, an end tag closes only an
// open one). Every walk that skips template content uses it, so they agree on what is inert.
func templateTag(depth *int, tt html.TokenType, name string) bool {
	if name != "template" {
		return false
	}
	switch tt {
	case html.StartTagToken, html.SelfClosingTagToken:
		*depth++
	case html.EndTagToken:
		if *depth > 0 {
			*depth--
		}
	}
	return true
}

// firstBaseHref returns the decoded href of the first <base> outside <template>. One inside <svg> or <math> counts too,
// though the browser ignores it: the tokenizer does not track foreign content, and the cost is an unneeded refusal.
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
		if templateTag(&template, tt, tok.Data) {
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

// baseMoves reports whether a base href resolves relative references from anywhere but the canvas folder. Only "",
// ".", "./" or one file name there keeps it; values leading back to the same folder are simpler to refuse than prove.
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

// dropBaseHref returns a <base> start tag without its href attributes, or false when it has none: every reference
// in the result is a data URI, so the base has no use there.
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
