package export

import (
	"bytes"
	"embed"
	"encoding/json"
	"errors"
	"html"
	"strconv"
	"strings"

	nethtml "golang.org/x/net/html"
)

// The viewer files are the page `doan export` writes around a canvas. Their
// tests are in app/src/main/exportViewer.test.ts.
//
//go:embed viewer/*
var viewerFS embed.FS

// Meta is the one source of the canvas name and width: the page title and
// header, the CSS-only iframe width, and the JSON shell.js reads all come from
// these two values.
type Meta struct {
	Name  string // file stem
	Width int    // doan:width
}

var byteOrderMark = []byte("\xef\xbb\xbf")

// Assemble wraps the rewritten canvas HTML in the viewer page. The canvas goes
// into a sandboxed iframe's srcdoc, with the measure script injected into its
// head. The placeholders in shell.html are replaced in one pass, so a canvas
// (or a name) that contains one is never expanded.
func Assemble(m Meta, canvasHTML []byte) ([]byte, error) {
	if m.Width < 1 {
		return nil, errors.New("canvas width must be a positive integer")
	}
	files := map[string]string{}
	for _, name := range []string{"shell.html", "shell.css", "lib.js", "shell.js", "measure.js"} {
		b, err := viewerFS.ReadFile("viewer/" + name)
		if err != nil {
			return nil, err
		}
		files[name] = string(b)
	}
	shell, style, lib, shellJS, measure := files["shell.html"], files["shell.css"], files["lib.js"], files["shell.js"], files["measure.js"]
	meta, err := json.Marshal(struct {
		Name  string `json:"name"`
		Width int    `json:"width"`
	}{m.Name, m.Width})
	if err != nil {
		return nil, err
	}
	// Both scripts are wrapped in a function: lib.js and the other files declare
	// top-level names that must not become globals of the canvas.
	shellScript := "(function () {\n" + lib + "\n" + shellJS + "\n})();"
	measureScript := "<script>(function () {\n" + lib + "\n" + measure + "\n})();</script>"

	// A browser drops a byte order mark; in a srcdoc string it would be text and
	// put the canvas into quirks mode.
	canvas := bytes.TrimPrefix(canvasHTML, byteOrderMark)
	at := measureOffset(canvas)
	srcdoc := [][]byte{canvas[:at], []byte(measureScript), canvas[at:]}

	values := map[string]string{
		"{{NAME}}":  html.EscapeString(m.Name),
		"{{WIDTH}}": strconv.Itoa(m.Width),
		// json.Marshal writes every "<" as <, so the value can neither end the
		// script element nor open an HTML comment.
		"{{META}}":   string(meta),
		"{{STYLE}}":  style,
		"{{SCRIPT}}": shellScript,
	}
	return fillPage(shell, values, srcdoc), nil
}

// Proto names the one frame an exported prototype plays. The CLI judged it from
// the canvas file before assembling (it exists once and is marked).
type Proto struct {
	Frame string // data-doan-frame
	Title string // data-doan-title, "" when the frame has none
}

// AssemblePrototype wraps the rewritten canvas HTML in the prototype page: the
// whole canvas in a sandboxed iframe that fills the browser window, with
// isolate.js first in its head to hide everything but the frame. It shares
// Assemble's one-pass placeholder filling, srcdoc escaping, script placement
// and byte order mark removal; only the shell differs. The page shows neither
// the canvas name nor its width, but takes the same Meta as Assemble.
func AssemblePrototype(m Meta, p Proto, canvasHTML []byte) ([]byte, error) {
	if p.Frame == "" {
		return nil, errors.New("prototype frame id must not be empty")
	}
	files := map[string]string{}
	for _, name := range []string{"prototype.html", "prototype.css", "prototype.js", "isolate.js"} {
		b, err := viewerFS.ReadFile("viewer/" + name)
		if err != nil {
			return nil, err
		}
		files[name] = string(b)
	}
	frame, err := json.Marshal(p.Frame)
	if err != nil {
		return nil, err
	}
	label := p.Title
	if label == "" {
		label = p.Frame
	}
	// json.Marshal writes "<", ">", "&", U+2028 and U+2029 as escapes, so the id
	// can neither end the script nor open an HTML comment in it.
	isolateScript := "<script>(function () {\nconst FRAME = " + string(frame) + ";\n" + files["isolate.js"] + "\n})();</script>"

	canvas := bytes.TrimPrefix(canvasHTML, byteOrderMark)
	at := measureOffset(canvas)
	srcdoc := [][]byte{canvas[:at], []byte(isolateScript), canvas[at:]}
	values := map[string]string{
		"{{NAME}}":   html.EscapeString(label),
		"{{STYLE}}":  files["prototype.css"],
		"{{SCRIPT}}": "(function () {\n" + files["prototype.js"] + "\n})();",
	}
	return fillPage(files["prototype.html"], values, srcdoc), nil
}

// fillPage writes shell into one buffer of its final size, with the srcdoc
// parts escaped straight into it: an escaped copy of the canvas and a growing
// buffer would each hold the whole page again.
func fillPage(shell string, values map[string]string, srcdoc [][]byte) []byte {
	size := 0
	fillShell(shell, func(s string) { size += len(s) }, func(key string) {
		if key != srcdocKey {
			size += len(values[key])
			return
		}
		for _, part := range srcdoc {
			size += len(part) + 4*bytes.Count(part, []byte("&")) + 5*bytes.Count(part, []byte(`"`))
		}
	})
	out := bytes.NewBuffer(make([]byte, 0, size))
	fillShell(shell, func(s string) { out.WriteString(s) }, func(key string) {
		if key != srcdocKey {
			out.WriteString(values[key])
			return
		}
		for _, part := range srcdoc {
			writeEscaped(out, part)
		}
	})
	return out.Bytes()
}

const srcdocKey = "{{SRCDOC}}"

var placeholders = []string{"{{NAME}}", "{{WIDTH}}", "{{META}}", "{{STYLE}}", "{{SCRIPT}}", srcdocKey}

// fillShell walks shell once, passing the text between placeholders to text
// and each placeholder to value. Like a strings.Replacer, it never looks at
// what replaces a placeholder, so a canvas (or a name) that contains one is
// not expanded.
func fillShell(shell string, text func(string), value func(key string)) {
	for {
		i := strings.Index(shell, "{{")
		if i < 0 {
			text(shell)
			return
		}
		key := ""
		for _, p := range placeholders {
			if strings.HasPrefix(shell[i:], p) {
				key = p
				break
			}
		}
		if key == "" {
			// One byte on: "{{{NAME}}" holds a placeholder at its second brace.
			text(shell[:i+1])
			shell = shell[i+1:]
			continue
		}
		text(shell[:i])
		value(key)
		shell = shell[i+len(key):]
	}
}

var attributeEscaper = strings.NewReplacer("&", "&amp;", `"`, "&quot;")

// writeEscaped is attributeEscaper for bytes, which it would first copy into
// a string.
func writeEscaped(out *bytes.Buffer, b []byte) {
	for {
		i := bytes.IndexAny(b, `&"`)
		if i < 0 {
			out.Write(b)
			return
		}
		out.Write(b[:i])
		if b[i] == '&' {
			out.WriteString("&amp;")
		} else {
			out.WriteString("&quot;")
		}
		b = b[i+1:]
	}
}

// measureOffset is where the measure script goes: the first thing in the head
// the parser would build, so its font listener is in place before anything
// loads. After an explicit <head>; without one, after <html>; without that,
// after the doctype. Never before the doctype: a script first in the document
// puts a standards-mode canvas into quirks mode.
func measureOffset(src []byte) int {
	z := nethtml.NewTokenizer(bytes.NewReader(src))
	pos, after, sawHTML := 0, 0, false
	for {
		tt := z.Next()
		end := pos + len(z.Raw())
		switch tt {
		case nethtml.DoctypeToken:
			if !sawHTML {
				after = end
			}
		case nethtml.TextToken:
			if len(bytes.Trim(z.Raw(), "\t\n\f\r ")) > 0 {
				return after
			}
		case nethtml.StartTagToken, nethtml.SelfClosingTagToken:
			name, _ := z.TagName()
			switch string(name) {
			case "html":
				if !sawHTML {
					sawHTML, after = true, end
				}
			case "head":
				return end
			default:
				return after
			}
		case nethtml.EndTagToken:
			return after
		case nethtml.ErrorToken:
			return after
		}
		pos = end
	}
}
