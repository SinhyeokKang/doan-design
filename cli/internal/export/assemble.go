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
	srcdoc := attributeEscaper.Replace(string(canvas[:at])) + attributeEscaper.Replace(measureScript) + attributeEscaper.Replace(string(canvas[at:]))

	var out bytes.Buffer
	replacer := strings.NewReplacer(
		"{{NAME}}", html.EscapeString(m.Name),
		"{{WIDTH}}", strconv.Itoa(m.Width),
		// json.Marshal writes every "<" as <, so the value can neither end the
		// script element nor open an HTML comment.
		"{{META}}", string(meta),
		"{{STYLE}}", style,
		"{{SCRIPT}}", shellScript,
		"{{SRCDOC}}", srcdoc,
	)
	if _, err := replacer.WriteString(&out, shell); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

var attributeEscaper = strings.NewReplacer("&", "&amp;", `"`, "&quot;")

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
