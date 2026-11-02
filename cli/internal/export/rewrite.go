package export

import (
	"bytes"
	"strings"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
	"golang.org/x/net/html"
)

// rewriteCSS replaces each reference CSSRefs finds with url("<replacement>")
// when replace returns true, and copies every other byte as it is. An
// @import target is reported as kindStylesheet, a url() as kindAsset.
func rewriteCSS(text string, mode canvas.Mode, replace func(ref string, kind refKind) (string, bool)) string {
	var b strings.Builder
	last := 0
	for _, r := range canvas.CSSRefs(text, mode) {
		kind := kindAsset
		if r.Import {
			kind = kindStylesheet
		}
		v, ok := replace(r.Value, kind)
		if !ok {
			continue
		}
		b.WriteString(text[last:r.Start])
		// `@import"a.css"` would otherwise become the identifier `importurl`.
		if r.Start > 0 && identByte(text[r.Start-1]) {
			b.WriteByte(' ')
		}
		b.WriteString(`url("`)
		b.WriteString(cssEscape(v))
		b.WriteString(`")`)
		last = r.End
	}
	if last == 0 {
		return text
	}
	b.WriteString(text[last:])
	return b.String()
}

func identByte(c byte) bool {
	return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-' || c == '_' || c >= 128
}

func cssEscape(s string) string {
	// "<" is escaped so a value written into <style> text cannot
	// close the element ("</style>") however it was spelled in the source.
	return strings.NewReplacer(`\`, `\\`, `"`, `\"`, "\n", `\a `, "\r", `\d `, "\f", `\c `, "<", `\3c `).Replace(s)
}

// srcsetSpans returns the URL spans of a srcset value, following the HTML
// "parse a srcset attribute" steps: trailing commas are not part of a URL,
// and a comma inside descriptor parentheses does not end a candidate.
func srcsetSpans(s string) [][2]int {
	var spans [][2]int
	space := func(c byte) bool { return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' }
	for i := 0; i < len(s); {
		for i < len(s) && (space(s[i]) || s[i] == ',') {
			i++
		}
		if i >= len(s) {
			break
		}
		start := i
		for i < len(s) && !space(s[i]) {
			i++
		}
		end := i
		for end > start && s[end-1] == ',' {
			end--
		}
		spans = append(spans, [2]int{start, end})
		if end < i {
			continue
		}
		depth := 0
		for i < len(s) {
			c := s[i]
			i++
			if c == '(' {
				depth++
			}
			if c == ')' && depth > 0 {
				depth--
			}
			if c == ',' && depth == 0 {
				break
			}
		}
	}
	return spans
}

func rewriteSrcset(s string, replace func(string) (string, bool)) string {
	var b strings.Builder
	last := 0
	for _, span := range srcsetSpans(s) {
		v, ok := replace(s[span[0]:span[1]])
		if !ok {
			continue
		}
		// srcset drops a URL's trailing commas, and an empty file's data URI
		// ends in its separator comma; an empty fragment keeps the URI whole.
		if strings.HasSuffix(v, ",") {
			v += "#"
		}
		b.WriteString(s[last:span[0]])
		b.WriteString(v)
		last = span[1]
	}
	if last == 0 {
		return s
	}
	b.WriteString(s[last:])
	return b.String()
}

type attrForm int

const (
	formNone attrForm = iota
	formURL
	formSrcset
	formStyle
)

// attrRef says how export treats one attribute (design.md '다시 쓰기').
func attrRef(tag, key string, get func(string) string) (refKind, attrForm) {
	if key == "style" {
		return kindAsset, formStyle
	}
	url := key == "href" || key == "xlink:href"
	switch tag {
	case "link":
		if key != "href" {
			break
		}
		for _, rel := range strings.Fields(strings.ToLower(get("rel"))) {
			if rel == "stylesheet" {
				return kindStylesheet, formURL
			}
		}
		for _, rel := range strings.Fields(strings.ToLower(get("rel"))) {
			if rel == "icon" || rel == "preload" || rel == "modulepreload" {
				return kindAsset, formURL
			}
		}
		return kindLink, formURL
	case "script", "video", "audio", "track":
		if key == "src" || tag == "video" && key == "poster" {
			return kindAsset, formURL
		}
	case "img", "source":
		if key == "src" {
			return kindAsset, formURL
		}
		if key == "srcset" {
			return kindAsset, formSrcset
		}
	case "input":
		if key == "src" && strings.EqualFold(strings.TrimSpace(get("type")), "image") {
			return kindAsset, formURL
		}
	case "image":
		// Outside SVG the parser turns <image src> into <img src>.
		if url || key == "src" {
			return kindAsset, formURL
		}
	case "use":
		if url {
			return kindUse, formURL
		}
	case "feimage":
		if url {
			return kindAsset, formURL
		}
	case "iframe", "frame", "embed":
		if key == "src" {
			return kindFrame, formURL
		}
	case "object":
		if key == "data" {
			return kindFrame, formURL
		}
	case "a", "area":
		if url {
			return kindLink, formURL
		}
	case "form":
		if key == "action" {
			return kindLink, formURL
		}
	}
	return kindAsset, formNone
}

// rewriteHTML rewrites the references in start tags and <style> text and
// copies every other token's raw bytes. html.Parse plus html.Render is not
// used because it can rebuild misnested markup into a different tree.
// <template> content is inert, as in `doan check`, and stays as written.
func rewriteHTML(src []byte, url func(kind refKind, href string) (string, bool), css func(text string, mode canvas.Mode) string) []byte {
	out, _ := rewriteHTMLBody(src, url, css)
	return out
}

// rewriteHTMLBody is rewriteHTML that also returns the output offset of the
// first </body> outside <template>, or -1 when there is none.
func rewriteHTMLBody(src []byte, url func(kind refKind, href string) (string, bool), css func(text string, mode canvas.Mode) string) ([]byte, int) {
	z := html.NewTokenizer(bytes.NewReader(src))
	bodyEnd := -1
	var out bytes.Buffer
	out.Grow(len(src))
	template := 0
	style := false
	for {
		tt := z.Next()
		// Token() lowercases and unescapes inside the buffer Raw() shares.
		raw := append([]byte(nil), z.Raw()...)
		inStyle := style
		style = false
		switch {
		case tt == html.ErrorToken:
			out.Write(raw)
			return out.Bytes(), bodyEnd
		case template > 0:
			tok := z.Token()
			if tok.Data == "template" && tt == html.StartTagToken {
				template++
			}
			if tok.Data == "template" && tt == html.EndTagToken {
				template--
			}
			out.Write(raw)
		case tt == html.TextToken && inStyle:
			out.WriteString(css(string(raw), canvas.Stylesheet))
		case tt == html.EndTagToken && bodyEnd < 0 && bytes.EqualFold(bytes.TrimSpace(raw[2:len(raw)-1]), []byte("body")):
			bodyEnd = out.Len()
			out.Write(raw)
		case tt == html.StartTagToken || tt == html.SelfClosingTagToken:
			tok := z.Token()
			if tok.Data == "template" {
				template++
				out.Write(raw)
				continue
			}
			// The parser ignores the self-closing flag: <style/> starts raw text too.
			style = tok.Data == "style"
			if tag, ok := rewriteTag(tok, url, css); ok {
				out.WriteString(tag)
			} else {
				out.Write(raw)
			}
		default:
			out.Write(raw)
		}
	}
}

func rewriteTag(tok html.Token, url func(refKind, string) (string, bool), css func(string, canvas.Mode) string) (string, bool) {
	// The browser keeps the first of duplicate attributes, so later ones are
	// neither resolved nor written back.
	var attrs []html.Attribute
	seen := map[string]bool{}
	for _, a := range tok.Attr {
		if !seen[a.Key] {
			seen[a.Key] = true
			attrs = append(attrs, a)
		}
	}
	get := func(k string) string {
		for _, a := range attrs {
			if a.Key == k {
				return a.Val
			}
		}
		return ""
	}
	changed := false
	for i, a := range attrs {
		kind, form := attrRef(tok.Data, a.Key, get)
		v, ok := a.Val, false
		switch form {
		case formURL:
			v, ok = url(kind, a.Val)
		case formSrcset:
			v = rewriteSrcset(a.Val, func(u string) (string, bool) { return url(kindAsset, u) })
			ok = v != a.Val
		case formStyle:
			v = css(a.Val, canvas.Declarations)
			ok = v != a.Val
		}
		if ok {
			attrs[i].Val = v
			changed = true
		}
	}
	if !changed {
		return "", false
	}
	var b strings.Builder
	b.WriteByte('<')
	b.WriteString(tok.Data)
	for _, a := range attrs {
		b.WriteByte(' ')
		b.WriteString(a.Key)
		b.WriteString(`="`)
		b.WriteString(strings.NewReplacer("&", "&amp;", `"`, "&quot;").Replace(a.Val))
		b.WriteByte('"')
	}
	if tok.Type == html.SelfClosingTagToken {
		b.WriteByte('/')
	}
	b.WriteByte('>')
	return b.String(), true
}
