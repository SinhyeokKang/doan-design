package export

import (
	"html"
	"regexp"
	"strings"
	"testing"

	nethtml "golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// prototypeParts decodes a prototype page the way a browser would.
type prototypeParts struct {
	title, iframeTitle, sandbox, srcdoc string
	iframes                             int
}

func parsePrototype(t *testing.T, page []byte) prototypeParts {
	t.Helper()
	doc, err := nethtml.Parse(strings.NewReader(string(page)))
	if err != nil {
		t.Fatal(err)
	}
	var p prototypeParts
	var visit func(*nethtml.Node)
	visit = func(n *nethtml.Node) {
		if n.Type == nethtml.ElementNode {
			switch n.DataAtom {
			case atom.Iframe:
				p.iframes++
				p.iframeTitle, p.sandbox, p.srcdoc = attr(n, "title"), attr(n, "sandbox"), attr(n, "srcdoc")
			case atom.Title:
				if p.title == "" && n.FirstChild != nil {
					p.title = n.FirstChild.Data
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			visit(c)
		}
	}
	visit(doc)
	return p
}

// isolateScript returns the injected isolation <script>...</script> of a prototype srcdoc.
func isolateScript(t *testing.T, srcdoc string) string {
	t.Helper()
	i := strings.Index(srcdoc, "<script>(function () {\nconst FRAME = ")
	if i < 0 {
		t.Fatalf("no isolation script: %.200s", srcdoc)
	}
	j := strings.Index(srcdoc[i:], "\n})();</script>")
	if j < 0 {
		t.Fatal("isolation script does not end")
	}
	return srcdoc[i : i+j+len("\n})();</script>")]
}

var checkout = Proto{Frame: "checkout", Title: "Checkout"}

func TestAssemblePrototypeReplacesEveryPlaceholderOnce(t *testing.T) {
	page, err := AssemblePrototype(Meta{Name: "board", Width: 1280}, checkout, []byte(simpleCanvas))
	if err != nil {
		t.Fatal(err)
	}
	if left := regexp.MustCompile(`\{\{[A-Z]+\}\}`).FindString(string(page)); left != "" {
		t.Fatalf("placeholder left: %s", left)
	}
	p := parsePrototype(t, page)
	if p.iframes != 1 || p.sandbox != "allow-scripts allow-forms" {
		t.Fatalf("iframes %d sandbox %q", p.iframes, p.sandbox)
	}
	// The tab names the frame, not the canvas, and carries no mark size.
	if p.title != "Checkout — Prototype" || p.iframeTitle != "Checkout" {
		t.Fatalf("title %q iframe title %q", p.title, p.iframeTitle)
	}
	if strings.Contains(string(page), "board") {
		t.Fatal("the canvas name is in the page")
	}
}

func TestAssemblePrototypeNamesAnUntitledFrameByItsID(t *testing.T) {
	page, err := AssemblePrototype(Meta{Name: "n", Width: 100}, Proto{Frame: "step-2"}, []byte(simpleCanvas))
	if err != nil {
		t.Fatal(err)
	}
	p := parsePrototype(t, page)
	if p.title != "step-2 — Prototype" || p.iframeTitle != "step-2" {
		t.Fatalf("title %q iframe title %q", p.title, p.iframeTitle)
	}
}

// A canvas, a title or a frame id that contains a placeholder must come through untouched.
func TestAssemblePrototypeDoesNotExpandPlaceholders(t *testing.T) {
	canvas := "<!doctype html><html><head></head><body>{{NAME}} {{WIDTH}} {{META}} {{STYLE}} {{SCRIPT}} {{SRCDOC}}</body></html>"
	page, err := AssemblePrototype(Meta{Name: "{{STYLE}}", Width: 640}, Proto{Frame: "{{SCRIPT}}", Title: "{{SRCDOC}}"}, []byte(canvas))
	if err != nil {
		t.Fatal(err)
	}
	p := parsePrototype(t, page)
	if !strings.Contains(p.srcdoc, "{{NAME}} {{WIDTH}} {{META}} {{STYLE}} {{SCRIPT}} {{SRCDOC}}") {
		t.Fatalf("canvas placeholders changed: %.300s", p.srcdoc)
	}
	if p.title != "{{SRCDOC}} — Prototype" || p.iframeTitle != "{{SRCDOC}}" {
		t.Fatalf("a title that looks like a placeholder was expanded: %q / %q", p.title, p.iframeTitle)
	}
	if !strings.Contains(isolateScript(t, p.srcdoc), `const FRAME = "{{SCRIPT}}";`) {
		t.Fatal("a frame id that looks like a placeholder was expanded")
	}
}

func TestAssemblePrototypeEscapesTheTitleAndFrameID(t *testing.T) {
	title := `</title><script>alert(1)</script> & "q" 'a' <!-- 공백`
	id := `</script><!-- "x" & 'y'` + "\u2028"
	page, err := AssemblePrototype(Meta{Name: "n", Width: 100}, Proto{Frame: id, Title: title}, []byte(simpleCanvas))
	if err != nil {
		t.Fatal(err)
	}
	p := parsePrototype(t, page)
	if p.title != title+" — Prototype" || p.iframeTitle != title {
		t.Fatalf("title decodes to %q / %q", p.title, p.iframeTitle)
	}
	if strings.Contains(string(page), "<script>alert(1)") || strings.Contains(string(page), "</title><script>") {
		t.Fatal("the title opened a tag")
	}
	// The id is JSON in a script inside the srcdoc: it can neither end that script nor open a comment.
	script := isolateScript(t, p.srcdoc)
	if strings.Count(script, "</script") != 1 || strings.Contains(script, "<!--") || strings.Contains(script, "\u2028") {
		t.Fatalf("the frame id could end the isolation script: %.200s", script)
	}
	if !strings.Contains(script, `const FRAME = "\u003c/script\u003e\u003c!-- \"x\" \u0026 'y'\u2028";`) {
		t.Fatalf("frame id not written as escaped JSON: %.200s", script)
	}
}

func TestAssemblePrototypeSrcdocIsTheCanvasWithTheIsolationScriptInItsHead(t *testing.T) {
	canvas := "<!doctype html>\n<html><head><title>a &amp; b</title></head><body>" +
		`<p title="say &quot;x&quot;">it's "q" &lt;tag&gt; &amp; 한글</p><template/><div data-doan-frame="checkout"></div></body></html>` + "\n"
	page, err := AssemblePrototype(Meta{Name: "n", Width: 100}, checkout, []byte(canvas))
	if err != nil {
		t.Fatal(err)
	}
	got := parsePrototype(t, page).srcdoc
	script := isolateScript(t, got)
	want := "<script>(function () {\nconst FRAME = \"checkout\";\n" + viewerFile(t, "isolate.js") + "\n})();</script>"
	if script != want {
		t.Fatalf("the isolation script is not the frame id and isolate.js in one function (%d bytes, want %d)", len(script), len(want))
	}
	i := strings.Index(got, script)
	if got[:i] != "<!doctype html>\n<html><head>" {
		t.Fatalf("script placed after %q", got[:i])
	}
	if got[:i]+got[i+len(script):] != canvas {
		t.Fatalf("canvas bytes changed: %q", got)
	}
	raw := string(page)
	start := strings.Index(raw, `srcdoc="`) + len(`srcdoc="`)
	end := strings.Index(raw[start:], `"`)
	if html.UnescapeString(raw[start:start+end]) != got {
		t.Fatal("srcdoc attribute ends early")
	}
	// The measure script is the canvas viewer's, not the prototype's.
	if strings.Contains(got, viewerFile(t, "measure.js")) {
		t.Fatal("the prototype srcdoc carries the board's measure script")
	}
}

func TestAssemblePrototypeShellIsPrototypeHTMLWithItsStyleAndScript(t *testing.T) {
	page, err := AssemblePrototype(Meta{Name: "n", Width: 100}, checkout, []byte(simpleCanvas))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(page), "<script>\n(function () {\n"+viewerFile(t, "prototype.js")+"\n})();\n</script>") {
		t.Fatal("the page script is not prototype.js in one function")
	}
	if !strings.Contains(string(page), "<style>\n"+viewerFile(t, "prototype.css")+"\n</style>") {
		t.Fatal("the page style is not prototype.css")
	}
	for _, other := range []string{"shell.js", "shell.css", "lib.js"} {
		if strings.Contains(string(page), viewerFile(t, other)) {
			t.Fatalf("the prototype page carries %s", other)
		}
	}
}

func TestAssemblePrototypeStripsALeadingByteOrderMark(t *testing.T) {
	page, err := AssemblePrototype(Meta{Name: "n", Width: 100}, checkout, []byte("\xef\xbb\xbf"+simpleCanvas))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(parsePrototype(t, page).srcdoc, "\ufeff") {
		t.Fatal("the BOM survived")
	}
}

func TestAssemblePrototypeRefusesAnEmptyFrameID(t *testing.T) {
	if _, err := AssemblePrototype(Meta{Name: "n", Width: 100}, Proto{Title: "Checkout"}, []byte(simpleCanvas)); err == nil {
		t.Fatal("an empty frame id was accepted")
	}
}

func TestAssemblePrototypeIsDeterministic(t *testing.T) {
	a, _ := AssemblePrototype(Meta{Name: "n", Width: 100}, checkout, []byte(simpleCanvas))
	b, _ := AssemblePrototype(Meta{Name: "n", Width: 100}, checkout, []byte(simpleCanvas))
	if string(a) != string(b) {
		t.Fatal("two runs differ")
	}
}

// The prototype page's bytes are part of the contract, as the canvas viewer's are
// (TestAssembleOutputIsPinned): change a digest only when the output is meant to change.
func TestAssemblePrototypeOutputIsPinned(t *testing.T) {
	for _, c := range []struct {
		name, canvas string
		proto        Proto
		want         string
	}{
		{"bom", "\xef\xbb\xbf<!doctype html><p title='\"&amp;'>{{NAME}}</p>", Proto{Frame: "a", Title: `a "&" <b>`}, "f35f507e1b170a501d2c91709c056537e66fce7f6dc7d9277515b3b69a7b5dc7"},
		{"bare", "<p>a & \"b\"</p>", Proto{Frame: "x</script>"}, "f1cd7d7af5598b77ad11481ef72ba7120f4c4390a4321eeb0939a2283154e7be"},
		{"empty", "", Proto{Frame: "checkout", Title: "Checkout"}, "1107ab0cbbe8fa63dcced92ad58e55ebe0f9a0b4ef475d72546a1ed17c806ffd"},
	} {
		page, err := AssemblePrototype(Meta{Name: "pinned", Width: 320}, c.proto, []byte(c.canvas))
		if err != nil {
			t.Fatal(err)
		}
		if got := pageDigest(page); got != c.want {
			t.Errorf("%s: page sha256 = %s, want %s", c.name, got, c.want)
		}
	}
}
