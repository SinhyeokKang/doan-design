package canvas

import "strings"

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
		if depth == 0 && t.kind == '@' && i+2 < len(ts) && lower(ts[i+1].text) == "import" && (ts[i+2].kind == 's' || ts[i+2].kind == 'u') {
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
	s.Imports = append(s.Imports, other.Imports...)
	s.URLs = append(s.URLs, other.URLs...)
}
