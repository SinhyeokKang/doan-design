package export

import (
	"encoding/base64"
	"strings"
	"unicode/utf8"
)

const hexDigits = "0123456789ABCDEF"

// dataURI writes text as percent-encoded UTF-8 and everything else as base64.
// The escaped set makes one URI safe in every place export writes it: a
// srcset candidate (no ASCII whitespace, no trailing comma), CSS url("…")
// (no quote, backslash or newline), an HTML attribute (no quote or &), and
// <style> text (no "<", so a nested "</style>" cannot end the element).
// "#" and "%" are escaped so the payload is neither a fragment nor an escape.
func dataURI(mime string, b []byte) string {
	mime = strings.ReplaceAll(mime, " ", "")
	if !textual(mime) || !utf8.Valid(b) {
		return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(b)
	}
	// Sized first: growing a builder past a large file copies it again.
	size := len("data:") + len(mime) + 1 + len(b)
	for i, c := range b {
		if escapedByte(b, i, c) {
			size += 2
		}
	}
	var s strings.Builder
	s.Grow(size)
	s.WriteString("data:")
	s.WriteString(mime)
	s.WriteByte(',')
	for i, c := range b {
		if escapedByte(b, i, c) {
			s.WriteByte('%')
			s.WriteByte(hexDigits[c>>4])
			s.WriteByte(hexDigits[c&15])
			continue
		}
		s.WriteByte(c)
	}
	return s.String()
}

func escapedByte(b []byte, i int, c byte) bool {
	return unsafeByte(c) || c == ',' && i == len(b)-1
}

func unsafeByte(c byte) bool {
	return c <= ' ' || c == 0x7f || strings.IndexByte(`"#%&<\`, c) >= 0
}

func textual(mime string) bool {
	base, _, _ := strings.Cut(mime, ";")
	return strings.HasPrefix(base, "text/") || base == "image/svg+xml" || base == "application/json"
}

// fragment keeps a reference's "#…" on its data URI, escaping only what
// would break the contexts dataURI is safe in.
func fragment(href string) string {
	i := strings.IndexByte(href, '#')
	if i < 0 {
		return ""
	}
	var s strings.Builder
	s.WriteByte('#')
	for _, c := range []byte(href[i+1:]) {
		if c != '%' && c != '#' && unsafeByte(c) {
			s.WriteByte('%')
			s.WriteByte(hexDigits[c>>4])
			s.WriteByte(hexDigits[c&15])
			continue
		}
		s.WriteByte(c)
	}
	return s.String()
}
