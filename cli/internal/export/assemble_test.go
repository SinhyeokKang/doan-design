package export

import (
	"html"
	"regexp"
	"strings"
	"testing"

	nethtml "golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// shellParts decodes the page the way a browser would: the srcdoc attribute, the meta JSON text and the
// number of placeholders left.
type shellParts struct {
	srcdoc, meta, title string
	iframeStyle         string
}

func parseShell(t *testing.T, page []byte) shellParts {
	t.Helper()
	doc, err := nethtml.Parse(strings.NewReader(string(page)))
	if err != nil {
		t.Fatal(err)
	}
	var p shellParts
	var visit func(*nethtml.Node)
	visit = func(n *nethtml.Node) {
		if n.Type == nethtml.ElementNode {
			switch {
			case n.DataAtom == atom.Iframe:
				for _, a := range n.Attr {
					switch a.Key {
					case "srcdoc":
						p.srcdoc = a.Val
					case "style":
						p.iframeStyle = a.Val
					}
				}
			case n.DataAtom == atom.Script && attr(n, "id") == "doan-meta":
				p.meta = n.FirstChild.Data
			case n.DataAtom == atom.Title && p.title == "":
				p.title = n.FirstChild.Data
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			visit(c)
		}
	}
	visit(doc)
	return p
}

func attr(n *nethtml.Node, key string) string {
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val
		}
	}
	return ""
}

const simpleCanvas = "<!doctype html>\n<html><head><meta charset=\"utf-8\"><title>x</title></head><body><p>hi</p></body></html>\n"

func TestAssembleReplacesEveryPlaceholderOnce(t *testing.T) {
	page, err := Assemble(Meta{Name: "board", Width: 1280}, []byte(simpleCanvas))
	if err != nil {
		t.Fatal(err)
	}
	if left := regexp.MustCompile(`\{\{[A-Z]+\}\}`).FindString(string(page)); left != "" {
		t.Fatalf("placeholder left: %s", left)
	}
	p := parseShell(t, page)
	if p.title != "board" || p.iframeStyle != "width:1280px" {
		t.Fatalf("title %q style %q", p.title, p.iframeStyle)
	}
	if p.meta != `{"name":"board","width":1280}` {
		t.Fatalf("meta %q", p.meta)
	}
}

// A canvas that contains a placeholder must come through untouched: one replacement pass, no rescanning.
func TestAssembleDoesNotExpandPlaceholdersInTheCanvas(t *testing.T) {
	canvas := "<!doctype html><html><head></head><body>{{NAME}} {{WIDTH}} {{META}} {{STYLE}} {{SCRIPT}} {{SRCDOC}}</body></html>"
	page, err := Assemble(Meta{Name: "{{WIDTH}}", Width: 640}, []byte(canvas))
	if err != nil {
		t.Fatal(err)
	}
	p := parseShell(t, page)
	if !strings.Contains(p.srcdoc, "{{NAME}} {{WIDTH}} {{META}} {{STYLE}} {{SCRIPT}} {{SRCDOC}}") {
		t.Fatalf("canvas placeholders changed: %.300s", p.srcdoc)
	}
	if p.title != "{{WIDTH}}" {
		t.Fatalf("a name that looks like a placeholder was expanded: %q", p.title)
	}
}

func TestAssembleEscapesTheNameAndMetaJSON(t *testing.T) {
	name := `</title><script>alert(1)</script> & "q" 'a' <!-- 공백`
	page, err := Assemble(Meta{Name: name, Width: 800}, []byte(simpleCanvas))
	if err != nil {
		t.Fatal(err)
	}
	p := parseShell(t, page)
	if p.title != name {
		t.Fatalf("title decodes to %q, want the name", p.title)
	}
	if strings.Contains(p.meta, "<") {
		t.Fatalf("meta JSON holds a raw '<': %s", p.meta)
	}
	if !strings.Contains(p.meta, `\u003c/title\u003e`) || !strings.Contains(p.meta, `\u003c!--`) {
		t.Fatalf("meta JSON does not escape '<': %s", p.meta)
	}
	// The raw page must carry no tag the name could have opened.
	if strings.Contains(string(page), "<script>alert(1)") || strings.Contains(string(page), "</title><script>") {
		t.Fatal("the name opened a tag")
	}
}

func TestAssembleSrcdocRoundTripsTheCanvas(t *testing.T) {
	canvas := "<!doctype html>\n<html><head><title>a &amp; b</title><style>a::before{content:\"\\\"\"}</style></head><body>" +
		`<p title="say &quot;x&quot;">it's "q" &lt;tag&gt; &amp; 한글 \ end</p><script>var s = "a&b";</script></body></html>` + "\n"
	page, err := Assemble(Meta{Name: "n", Width: 100}, []byte(canvas))
	if err != nil {
		t.Fatal(err)
	}
	got := parseShell(t, page).srcdoc
	// Without the injected script the srcdoc is the canvas, byte for byte.
	script := injectedScript(t, got)
	if strings.Replace(got, script, "", 1) != canvas {
		t.Fatalf("canvas changed: %q", got)
	}
	// The attribute value must not hold a raw quote that would end it early.
	raw := string(page)
	start := strings.Index(raw, `srcdoc="`) + len(`srcdoc="`)
	end := strings.Index(raw[start:], `"`)
	if html.UnescapeString(raw[start:start+end]) != got {
		t.Fatal("srcdoc attribute ends early")
	}
}

// The script goes into the head the parser would build, and never before the doctype: a script first in the
// document puts a standards-mode canvas into quirks mode.
func TestAssemblePlacesTheScriptInTheHeadAfterTheDoctype(t *testing.T) {
	for name, c := range map[string]struct{ canvas, before string }{
		"head":            {"<!doctype html><html><head><title>x</title></head><body></body></html>", "<!doctype html><html><head>"},
		"attributes":      {"<!DOCTYPE html>\n<html lang=\"ko\">\n<head lang=\"ko\">\n<title>x</title></head><body></body></html>", "<!DOCTYPE html>\n<html lang=\"ko\">\n<head lang=\"ko\">"},
		"no head":         {"<!doctype html><html><body><p>x</p></body></html>", "<!doctype html><html>"},
		"no html":         {"<!doctype html><p>x</p>", "<!doctype html>"},
		"comment first":   {"<!-- note --><!doctype html><html><head></head><body></body></html>", "<!-- note --><!doctype html><html><head>"},
		"head in comment": {"<!doctype html><!-- <head> --><html><head></head><body></body></html>", "<!doctype html><!-- <head> --><html><head>"},
		"head in script":  {"<!doctype html><html><body><script>var h = \"<head>\";</script></body></html>", "<!doctype html><html>"},
		"head after body": {"<!doctype html><html><body><head></head></body></html>", "<!doctype html><html>"},
		"BOM":             {"\ufeff<!doctype html><html><head></head><body></body></html>", "<!doctype html><html><head>"},
		"uppercase":       {"<!DOCTYPE HTML><HTML><HEAD></HEAD><BODY></BODY></HTML>", "<!DOCTYPE HTML><HTML><HEAD>"},
		"space first":     {"\n  <!doctype html>\n<html><head></head><body></body></html>", "\n  <!doctype html>\n<html><head>"},
		"no doctype":      {"<p>x</p>", ""},
		"empty":           {"", ""},
	} {
		t.Run(name, func(t *testing.T) {
			page, err := Assemble(Meta{Name: "n", Width: 100}, []byte(c.canvas))
			if err != nil {
				t.Fatal(err)
			}
			got := parseShell(t, page).srcdoc
			script := injectedScript(t, got)
			i := strings.Index(got, script)
			if got[:i] != c.before {
				t.Fatalf("script placed after %q, want after %q", got[:i], c.before)
			}
			// Nothing else was lost or reordered.
			if got[:i]+got[i+len(script):] != strings.TrimPrefix(c.canvas, "\ufeff") {
				t.Fatalf("canvas bytes changed: %q", got)
			}
		})
	}
}

// injectedScript returns the injected <script>...</script> text of a srcdoc.
func injectedScript(t *testing.T, srcdoc string) string {
	t.Helper()
	i := strings.Index(srcdoc, "<script>(function () {")
	if i < 0 {
		t.Fatalf("no injected script: %.200s", srcdoc)
	}
	j := strings.Index(srcdoc[i:], "})();</script>")
	if j < 0 {
		t.Fatal("injected script does not end")
	}
	return srcdoc[i : i+j+len("})();</script>")]
}

func TestAssembleInjectsLibAndMeasureInOneFunction(t *testing.T) {
	page, err := Assemble(Meta{Name: "n", Width: 100}, []byte(simpleCanvas))
	if err != nil {
		t.Fatal(err)
	}
	script := injectedScript(t, parseShell(t, page).srcdoc)
	lib, measure := viewerFile(t, "lib.js"), viewerFile(t, "measure.js")
	want := "<script>(function () {\n" + lib + "\n" + measure + "\n})();</script>"
	if script != want {
		t.Fatalf("injected script is not lib.js + measure.js in one function (%d bytes, want %d)", len(script), len(want))
	}
	if strings.Count(script, "</script") != 1 || strings.Contains(script, "<!--") {
		t.Fatal("the injected script could end early")
	}
}

func TestAssembleShellScriptIsLibAndShellInOneFunction(t *testing.T) {
	page, err := Assemble(Meta{Name: "n", Width: 100}, []byte(simpleCanvas))
	if err != nil {
		t.Fatal(err)
	}
	want := "(function () {\n" + viewerFile(t, "lib.js") + "\n" + viewerFile(t, "shell.js") + "\n})();"
	if !strings.Contains(string(page), "<script>\n"+want+"\n</script>") {
		t.Fatal("the shell script is not lib.js + shell.js in one function")
	}
	if !strings.Contains(string(page), "<style>\n"+viewerFile(t, "shell.css")+"\n</style>") {
		t.Fatal("the shell style is not shell.css")
	}
}

func TestAssembleStripsALeadingByteOrderMark(t *testing.T) {
	// A browser drops the BOM of a byte stream; in a srcdoc string it would be text and force quirks mode.
	page, err := Assemble(Meta{Name: "n", Width: 100}, []byte("\xef\xbb\xbf"+simpleCanvas))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(parseShell(t, page).srcdoc, "\ufeff") {
		t.Fatal("the BOM survived")
	}
}

func TestAssembleIsDeterministic(t *testing.T) {
	a, _ := Assemble(Meta{Name: "n", Width: 100}, []byte(simpleCanvas))
	b, _ := Assemble(Meta{Name: "n", Width: 100}, []byte(simpleCanvas))
	if string(a) != string(b) {
		t.Fatal("two runs differ")
	}
}

func TestAssembleRefusesWhatTheViewerCannotShow(t *testing.T) {
	if _, err := Assemble(Meta{Name: "n", Width: 0}, []byte(simpleCanvas)); err == nil {
		t.Fatal("width 0 accepted")
	}
	if _, err := Assemble(Meta{Name: "n", Width: -5}, []byte(simpleCanvas)); err == nil {
		t.Fatal("negative width accepted")
	}
}

func viewerFile(t *testing.T, name string) string {
	t.Helper()
	b, err := viewerFS.ReadFile("viewer/" + name)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}
