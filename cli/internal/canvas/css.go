package canvas

import (
	"strings"
	"unicode/utf8"
)

type Mode int

const (
	Stylesheet Mode = iota
	Declarations
)

type Reference struct {
	Name        string
	HasFallback bool
}
type Scan struct {
	Defs                  map[string]bool
	Refs                  []Reference
	Colors, Imports, URLs []string
	// ViewportHeights holds raw dimension tokens (e.g. "100dvh") from declaration values.
	ViewportHeights []string
}
type token struct {
	kind       byte
	text       string
	start, end int
}

func asciiSpace(c byte) bool { return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' }
func ident(c byte) bool {
	return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-' || c == '_' || c >= 128
}
func lower(s string) string {
	return strings.Map(func(r rune) rune {
		if r >= 'A' && r <= 'Z' {
			return r + 32
		}
		return r
	}, s)
}
func trimASCII(s string) string {
	a, b := 0, len(s)
	for a < b && asciiSpace(s[a]) {
		a++
	}
	for b > a && asciiSpace(s[b-1]) {
		b--
	}
	return s[a:b]
}
func quoted(s string, i int) (string, int) {
	q := s[i]
	i++
	var b strings.Builder
	for i < len(s) {
		if s[i] == q {
			return b.String(), i + 1
		}
		if s[i] == '\n' || s[i] == '\r' || s[i] == '\f' {
			return b.String(), i
		}
		if s[i] == '\\' && i+1 < len(s) {
			i++
			if s[i] == '\n' {
				i++
				continue
			}
		}
		b.WriteByte(s[i])
		i++
	}
	return b.String(), i
}
func lex(s string) []token {
	var out []token
	for i := 0; i < len(s); {
		if asciiSpace(s[i]) {
			i++
			continue
		}
		if strings.HasPrefix(s[i:], "/*") {
			j := strings.Index(s[i+2:], "*/")
			if j < 0 {
				break
			}
			i += j + 4
			continue
		}
		start := i
		if s[i] == '\'' || s[i] == '"' {
			v, end := quoted(s, i)
			out = append(out, token{'s', v, start, end})
			i = end
			continue
		}
		if ident(s[i]) {
			i++
			for i < len(s) && ident(s[i]) {
				i++
			}
			name := s[start:i]
			if lower(name) == "url" && i < len(s) && s[i] == '(' {
				i++
				for i < len(s) && asciiSpace(s[i]) {
					i++
				}
				var v string
				if i < len(s) && (s[i] == '\'' || s[i] == '"') {
					v, i = quoted(s, i)
					for i < len(s) && s[i] != ')' {
						i++
					}
				} else {
					a := i
					for i < len(s) && s[i] != ')' {
						if s[i] == '\\' && i+1 < len(s) {
							i++
						}
						i++
					}
					v = trimASCII(s[a:i])
				}
				if i < len(s) {
					i++
				}
				out = append(out, token{'u', v, start, i})
				continue
			}
			out = append(out, token{'i', name, start, i})
			continue
		}
		out = append(out, token{s[i], s[i : i+1], i, i + 1})
		i++
	}
	return out
}

var viewportHeightUnits = map[string]bool{"vh": true, "dvh": true, "svh": true, "lvh": true, "vb": true, "dvb": true, "svb": true, "lvb": true}

// The lexer splits numbers and escaped identifiers into fragments ("1.5vh" is "1", ".", "5vh";
// "100v\68" is "100v", "\", "68"), so dimensions are read from the raw text instead.
func validEscape(s string, i int) bool {
	return i+1 < len(s) && s[i] == '\\' && s[i+1] != '\n' && s[i+1] != '\r' && s[i+1] != '\f'
}
func identStart(s string, i int) bool {
	if i >= len(s) {
		return false
	}
	c := s[i]
	return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c == '_' || c >= 128 || validEscape(s, i)
}
func startsIdent(s string, i int) bool {
	if i < len(s) && s[i] == '-' {
		return i+1 < len(s) && (s[i+1] == '-' || identStart(s, i+1))
	}
	return identStart(s, i)
}
func hexDigit(c byte) bool {
	return c >= '0' && c <= '9' || c >= 'a' && c <= 'f' || c >= 'A' && c <= 'F'
}

// readIdent consumes an identifier from i and returns its end and its escape-decoded text.
func readIdent(s string, i int) (int, string) {
	var b strings.Builder
	for i < len(s) {
		switch {
		case validEscape(s, i):
			i++
			if hexDigit(s[i]) {
				n := 0
				v := 0
				for n < 6 && i < len(s) && hexDigit(s[i]) {
					d := s[i]
					switch {
					case d >= 'a':
						d = d - 'a' + 10
					case d >= 'A':
						d = d - 'A' + 10
					default:
						d -= '0'
					}
					v = v*16 + int(d)
					i++
					n++
				}
				if i < len(s) && asciiSpace(s[i]) {
					i++
				}
				if v == 0 || v > 0x10FFFF || v >= 0xD800 && v <= 0xDFFF {
					v = 0xFFFD
				}
				b.WriteRune(rune(v))
			} else {
				r, n := utf8.DecodeRuneInString(s[i:])
				b.WriteRune(r)
				i += n
			}
		case ident(s[i]):
			b.WriteByte(s[i])
			i++
		default:
			return i, b.String()
		}
	}
	return i, b.String()
}
func digits(s string, i int) int {
	for i < len(s) && s[i] >= '0' && s[i] <= '9' {
		i++
	}
	return i
}

// numberEnd returns the end of a CSS number starting at i, or i when none starts there.
func numberEnd(s string, i int) int {
	j := i
	if j < len(s) && (s[j] == '+' || s[j] == '-') {
		j++
	}
	switch {
	case digits(s, j) > j:
		j = digits(s, j)
		if j+1 < len(s) && s[j] == '.' && digits(s, j+1) > j+1 {
			j = digits(s, j+1)
		}
	case j+1 < len(s) && s[j] == '.' && digits(s, j+1) > j+1:
		j = digits(s, j+1)
	default:
		return i
	}
	k := j
	if k < len(s) && (s[k] == 'e' || s[k] == 'E') {
		k++
		if k < len(s) && (s[k] == '+' || s[k] == '-') {
			k++
		}
		if digits(s, k) > k {
			j = digits(s, k)
		}
	}
	return j
}

// viewportHeights walks the declaration value as CSS tokens and returns the raw text of every
// dimension whose decoded unit is a viewport height unit.
func viewportHeights(text string, ts []token) []string {
	var out []string
	pos := 0
	for _, t := range ts {
		if t.start < pos {
			continue
		}
		if t.kind == 's' || t.kind == 'u' {
			pos = t.end
			continue
		}
		p := t.start
		pos = t.end
		if text[p] == '#' {
			pos, _ = readIdent(text, p+1)
			continue
		}
		if e := numberEnd(text, p); e > p {
			pos = e
			if startsIdent(text, e) {
				end, unit := readIdent(text, e)
				pos = end
				if viewportHeightUnits[lower(unit)] {
					out = append(out, strings.TrimRight(text[p:end], " \t\n\r\f"))
				}
			}
			continue
		}
		if startsIdent(text, p) {
			pos, _ = readIdent(text, p)
		}
	}
	return out
}
func custom(s string) bool { return strings.HasPrefix(s, "--") && len(s) > 2 }
func ScanCSS(text string, mode Mode) Scan {
	s := Scan{Defs: map[string]bool{}}
	ts := lex(text)
	depth := 0
	if mode == Declarations {
		depth = 1
	}
	start := 0
	paren := 0
	for i, t := range ts {
		if t.kind == 'u' {
			s.URLs = append(s.URLs, t.text)
		}
		if depth == 0 && t.kind == '@' && i+2 < len(ts) && ts[i+1].start == t.end && lower(ts[i+1].text) == "import" && (ts[i+2].kind == 's' || ts[i+2].kind == 'u') {
			s.Imports = append(s.Imports, ts[i+2].text)
		}
		if t.kind == '(' {
			paren++
		}
		if t.kind == ')' && paren > 0 {
			paren--
		}
		if t.kind == '{' {
			depth++
			start = i + 1
			paren = 0
			continue
		}
		if t.kind == '}' || t.kind == ';' && paren == 0 {
			if depth > 0 {
				s.declaration(text, ts[start:i])
			}
			if t.kind == '}' {
				depth--
				if depth < 0 {
					depth = 0
				}
			}
			start = i + 1
			paren = 0
		}
	}
	if depth > 0 && start < len(ts) {
		s.declaration(text, ts[start:])
	}
	return s
}
func (s *Scan) declaration(text string, ts []token) {
	if len(ts) < 2 || ts[0].kind != 'i' || ts[1].kind != ':' {
		return
	}
	s.ViewportHeights = append(s.ViewportHeights, viewportHeights(text, ts[2:])...)
	if custom(ts[0].text) {
		s.Defs[ts[0].text] = true
	}
	for i := 2; i < len(ts); i++ {
		t := ts[i]
		if t.kind == 'i' && lower(t.text) == "var" && i+2 < len(ts) && ts[i+1].kind == '(' && ts[i+1].start == t.end && ts[i+2].kind == 'i' && custom(ts[i+2].text) {
			fallback := i+3 < len(ts) && ts[i+3].kind == ','
			s.Refs = append(s.Refs, Reference{ts[i+2].text, fallback})
		}
		if t.kind == '#' && i+1 < len(ts) && ts[i+1].start == t.end && ts[i+1].kind == 'i' {
			v := ts[i+1].text
			n := len(v)
			valid := n == 3 || n == 4 || n == 6 || n == 8
			for j := 0; j < n; j++ {
				if !(v[j] >= '0' && v[j] <= '9' || v[j] >= 'a' && v[j] <= 'f' || v[j] >= 'A' && v[j] <= 'F') {
					valid = false
				}
			}
			if valid {
				s.Colors = append(s.Colors, "#"+v)
			}
		}
		if t.kind == 'i' && (lower(t.text) == "rgb" || lower(t.text) == "rgba") && i+1 < len(ts) && ts[i+1].kind == '(' && ts[i+1].start == t.end {
			end := ts[len(ts)-1].end
			d := 0
			for j := i + 1; j < len(ts); j++ {
				if ts[j].kind == '(' {
					d++
				}
				if ts[j].kind == ')' {
					d--
					if d == 0 {
						end = ts[j].end
						break
					}
				}
			}
			s.Colors = append(s.Colors, text[t.start:end])
		}
	}
}
func (s *Scan) merge(other Scan) {
	if s.Defs == nil {
		s.Defs = map[string]bool{}
	}
	for d := range other.Defs {
		s.Defs[d] = true
	}
	s.Refs = append(s.Refs, other.Refs...)
	s.Colors = append(s.Colors, other.Colors...)
	s.ViewportHeights = append(s.ViewportHeights, other.ViewportHeights...)
	s.Imports = append(s.Imports, other.Imports...)
	s.URLs = append(s.URLs, other.URLs...)
}

// CSSRef is a reference ScanCSS reports (a url() token or the target of a
// top-level @import), with the byte span of its token so it can be rewritten
// in place. Value is fully escape-decoded, unlike ScanCSS's text.
type CSSRef struct {
	Value      string
	Import     bool
	Start, End int
}

// CSSRefs walks the same tokens and @import rule as ScanCSS, so export
// rewrites exactly what check reaches.
func CSSRefs(text string, mode Mode) []CSSRef {
	ts := lex(text)
	depth := 0
	if mode == Declarations {
		depth = 1
	}
	var out []CSSRef
	target := -1
	for i, t := range ts {
		if depth == 0 && t.kind == '@' && i+2 < len(ts) && ts[i+1].start == t.end && lower(ts[i+1].text) == "import" && (ts[i+2].kind == 's' || ts[i+2].kind == 'u') {
			target = i + 2
		}
		if t.kind == 'u' || i == target {
			out = append(out, CSSRef{Value: refValue(text[t.start:t.end]), Import: i == target, Start: t.start, End: t.end})
		}
		if t.kind == '{' {
			depth++
		}
		if t.kind == '}' && depth > 0 {
			depth--
		}
	}
	return out
}

// refValue decodes a string token or a url() token's raw text.
func refValue(raw string) string {
	if raw[0] == '"' || raw[0] == '\'' {
		v, _ := decodeString(raw, 0)
		return v
	}
	i := strings.IndexByte(raw, '(') + 1
	for i < len(raw) && asciiSpace(raw[i]) {
		i++
	}
	if i < len(raw) && (raw[i] == '"' || raw[i] == '\'') {
		v, _ := decodeString(raw, i)
		return v
	}
	end := len(raw)
	if strings.HasSuffix(raw, ")") {
		end--
	}
	var b strings.Builder
	for j := i; j < end; {
		if validEscape(raw, j) {
			r, next := decodeEscape(raw, j+1)
			b.WriteRune(r)
			j = next
			continue
		}
		b.WriteByte(raw[j])
		j++
	}
	return trimASCII(b.String())
}

// decodeString reads the quoted string starting at i, per CSS Syntax §4.3.5.
func decodeString(s string, i int) (string, int) {
	q := s[i]
	i++
	var b strings.Builder
	for i < len(s) {
		c := s[i]
		switch {
		case c == q:
			return b.String(), i + 1
		case c == '\n' || c == '\r' || c == '\f':
			return b.String(), i
		case c == '\\':
			if i+1 >= len(s) {
				return b.String(), i + 1
			}
			if n := s[i+1]; n == '\n' || n == '\f' {
				i += 2
				continue
			}
			if s[i+1] == '\r' {
				i += 2
				if i < len(s) && s[i] == '\n' {
					i++
				}
				continue
			}
			r, next := decodeEscape(s, i+1)
			b.WriteRune(r)
			i = next
		default:
			b.WriteByte(c)
			i++
		}
	}
	return b.String(), i
}

// decodeEscape decodes the escape whose body starts at i (after the backslash).
func decodeEscape(s string, i int) (rune, int) {
	if !hexDigit(s[i]) {
		r, n := utf8.DecodeRuneInString(s[i:])
		return r, i + n
	}
	v := 0
	for n := 0; n < 6 && i < len(s) && hexDigit(s[i]); n++ {
		d := s[i]
		switch {
		case d >= 'a':
			d = d - 'a' + 10
		case d >= 'A':
			d = d - 'A' + 10
		default:
			d -= '0'
		}
		v = v*16 + int(d)
		i++
	}
	if i+1 < len(s) && s[i] == '\r' && s[i+1] == '\n' {
		i += 2
	} else if i < len(s) && asciiSpace(s[i]) {
		i++
	}
	if v == 0 || v > 0x10FFFF || v >= 0xD800 && v <= 0xDFFF {
		v = 0xFFFD
	}
	return rune(v), i
}
