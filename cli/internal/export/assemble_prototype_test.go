package export

import (
	"encoding/json"
	"html"
	"regexp"
	"strings"
	"testing"

	nethtml "golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// prototypeParts decodes a prototype page the way a browser would: the start frame's static title and
// no-JavaScript lines, the group JSON, and the canvas held in the holder's data attribute.
type prototypeParts struct {
	title, meta, canvas string
	noscripts           []string
	iframes, holders    int
	metas               int
}

// The page's group JSON, as prototype.js reads it.
type prototypeMeta struct {
	Start  string `json:"start"`
	Frames []struct {
		ID    string `json:"id"`
		Title string `json:"title"`
	} `json:"frames"`
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
			switch {
			case n.DataAtom == atom.Iframe:
				p.iframes++
			case n.DataAtom == atom.Div && attr(n, "id") == "canvas":
				p.holders++
				p.canvas = attr(n, "data-srcdoc")
			case n.DataAtom == atom.Script && attr(n, "id") == "doan-prototype":
				p.metas++
				if attr(n, "type") != "application/json" {
					t.Fatalf("group script type %q", attr(n, "type"))
				}
				if n.FirstChild != nil {
					p.meta = n.FirstChild.Data
				}
			case n.DataAtom == atom.Title:
				if p.title == "" && n.FirstChild != nil {
					p.title = n.FirstChild.Data
				}
			case n.DataAtom == atom.Noscript:
				var text strings.Builder
				var collect func(*nethtml.Node)
				collect = func(c *nethtml.Node) {
					if c.Type == nethtml.TextNode {
						text.WriteString(c.Data)
					}
					for k := c.FirstChild; k != nil; k = k.NextSibling {
						collect(k)
					}
				}
				collect(n)
				// The parser keeps a <noscript>'s content as text (scripting on); the tags inside it go.
				p.noscripts = append(p.noscripts, regexp.MustCompile(`<[^>]*>`).ReplaceAllString(text.String(), ""))
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			visit(c)
		}
	}
	visit(doc)
	return p
}

func (p prototypeParts) group(t *testing.T) prototypeMeta {
	t.Helper()
	var m prototypeMeta
	if err := json.Unmarshal([]byte(p.meta), &m); err != nil {
		t.Fatalf("group JSON %q: %v", p.meta, err)
	}
	return m
}

// isolateScript returns the injected isolation <script>...</script> of a prototype srcdoc.
func isolateScript(t *testing.T, srcdoc string) string {
	t.Helper()
	want := "<script>(function () {\n" + viewerFile(t, "isolate.js") + "\n})();</script>"
	if !strings.Contains(srcdoc, want) {
		t.Fatalf("no isolation script: %.200s", srcdoc)
	}
	return want
}

var checkout = Proto{Frame: "checkout", Frames: []ProtoFrame{{ID: "checkout", Title: "Checkout"}}}

// The page shape a recipient's browser and X2's markers rely on, checked on the page itself rather than against a
// regenerated export (POSTMORTEM 2026-11-14 'An eval check that compared a prototype export only with a regenerated
// one accepted the canvas viewer').
func TestAssemblePrototypePageShape(t *testing.T) {
	proto := Proto{Frame: "cart", Frames: []ProtoFrame{{ID: "home", Title: "Home"}, {ID: "cart", Title: "Cart"}, {ID: "pay"}}}
	page, err := AssemblePrototype(Meta{Name: "board", Width: 1280}, proto, []byte(simpleCanvas))
	if err != nil {
		t.Fatal(err)
	}
	if left := regexp.MustCompile(`\{\{[A-Z]+\}\}`).FindString(string(page)); left != "" {
		t.Fatalf("placeholder left: %s", left)
	}
	p := parsePrototype(t, page)
	// No iframe in the file itself: prototype.js makes one per frame shown.
	if p.iframes != 0 || p.holders != 1 || p.metas != 1 {
		t.Fatalf("iframes %d holders %d group scripts %d", p.iframes, p.holders, p.metas)
	}
	// The tab names the start frame, not the canvas, and carries no mark size.
	if p.title != "Cart — Prototype" {
		t.Fatalf("title %q", p.title)
	}
	if strings.Contains(string(page), "board") {
		t.Fatal("the canvas name is in the page")
	}
	g := p.group(t)
	if g.Start != "cart" || len(g.Frames) != 3 {
		t.Fatalf("group %+v", g)
	}
	// Each frame's name as the page shows it: its title, else its id.
	for i, want := range [][2]string{{"home", "Home"}, {"cart", "Cart"}, {"pay", "pay"}} {
		if g.Frames[i].ID != want[0] || g.Frames[i].Title != want[1] {
			t.Fatalf("frame %d: %+v, want %v", i, g.Frames[i], want)
		}
	}
	if !reflectEqual(p.noscripts, []string{".proto-frame { display: none; }", "Open this file in a web browser to play this prototype."}) {
		t.Fatalf("noscripts %q", p.noscripts)
	}
	if !strings.Contains(string(page), "<noscript><style>.proto-frame { display: none; }</style></noscript>") {
		t.Fatal("the head's noscript style changed")
	}
	if strings.Contains(string(page), `id="doan-meta"`) {
		t.Fatal("the prototype page carries the canvas viewer's marker")
	}
}

func reflectEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestAssemblePrototypeNamesAnUntitledFrameByItsID(t *testing.T) {
	page, err := AssemblePrototype(Meta{Name: "n", Width: 100}, Proto{Frame: "step-2", Frames: []ProtoFrame{{ID: "step-2"}}}, []byte(simpleCanvas))
	if err != nil {
		t.Fatal(err)
	}
	p := parsePrototype(t, page)
	if p.title != "step-2 — Prototype" || p.group(t).Frames[0].Title != "step-2" {
		t.Fatalf("title %q group %q", p.title, p.meta)
	}
}

// A canvas, a title or a frame id that contains a placeholder must come through untouched.
func TestAssemblePrototypeDoesNotExpandPlaceholders(t *testing.T) {
	canvas := "<!doctype html><html><head></head><body>{{NAME}} {{WIDTH}} {{META}} {{STYLE}} {{SCRIPT}} {{SRCDOC}}</body></html>"
	page, err := AssemblePrototype(Meta{Name: "{{STYLE}}", Width: 640}, Proto{Frame: "{{SCRIPT}}", Frames: []ProtoFrame{{ID: "{{SCRIPT}}", Title: "{{SRCDOC}}"}}}, []byte(canvas))
	if err != nil {
		t.Fatal(err)
	}
	p := parsePrototype(t, page)
	if !strings.Contains(p.canvas, "{{NAME}} {{WIDTH}} {{META}} {{STYLE}} {{SCRIPT}} {{SRCDOC}}") {
		t.Fatalf("canvas placeholders changed: %.300s", p.canvas)
	}
	if p.title != "{{SRCDOC}} — Prototype" {
		t.Fatalf("a title that looks like a placeholder was expanded: %q", p.title)
	}
	if g := p.group(t); g.Start != "{{SCRIPT}}" || g.Frames[0].Title != "{{SRCDOC}}" {
		t.Fatalf("a frame id or title that looks like a placeholder was expanded: %q", p.meta)
	}
}

func TestAssemblePrototypeEscapesTitlesAndFrameIDs(t *testing.T) {
	title := `</title><script>alert(1)</script> & "q" 'a' <!-- 공백`
	id := `</script><!-- "x" & 'y'` + "\u2028"
	other := `a b%20#?` + strings.Repeat("\U0001F98A", 2)
	page, err := AssemblePrototype(Meta{Name: "n", Width: 100}, Proto{Frame: id, Frames: []ProtoFrame{{ID: id, Title: title}, {ID: other, Title: "</SCRIPT >"}}}, []byte(simpleCanvas))
	if err != nil {
		t.Fatal(err)
	}
	p := parsePrototype(t, page)
	if p.title != title+" — Prototype" {
		t.Fatalf("title decodes to %q", p.title)
	}
	if strings.Contains(string(page), "<script>alert(1)") || strings.Contains(string(page), "</title><script>") {
		t.Fatal("the title opened a tag")
	}
	// The group is JSON in a script: no id or title can end that script or open a comment in it.
	if strings.ContainsAny(p.meta, "<>&") || strings.Contains(p.meta, "\u2028") {
		t.Fatalf("the group JSON could end its script: %q", p.meta)
	}
	g := p.group(t)
	if g.Start != id || g.Frames[0].ID != id || g.Frames[0].Title != title || g.Frames[1].ID != other || g.Frames[1].Title != "</SCRIPT >" {
		t.Fatalf("group decodes to %+v", g)
	}
}

func TestAssemblePrototypeHoldsTheCanvasWithTheIsolationScriptInItsHead(t *testing.T) {
	canvas := "<!doctype html>\n<html><head><title>a &amp; b</title></head><body>" +
		`<p title="say &quot;x&quot;">it's "q" &lt;tag&gt; &amp; 한글</p><template/><div data-doan-frame="checkout"></div></body></html>` + "\n"
	page, err := AssemblePrototype(Meta{Name: "n", Width: 100}, checkout, []byte(canvas))
	if err != nil {
		t.Fatal(err)
	}
	got := parsePrototype(t, page).canvas
	script := isolateScript(t, got)
	// The frame is not written into the script: isolate.js reads it from the iframe's name.
	if strings.Contains(got, "const FRAME = \"") {
		t.Fatal("the frame id is written into the srcdoc")
	}
	i := strings.Index(got, script)
	if got[:i] != "<!doctype html>\n<html><head>" {
		t.Fatalf("script placed after %q", got[:i])
	}
	if got[:i]+got[i+len(script):] != canvas {
		t.Fatalf("canvas bytes changed: %q", got)
	}
	raw := string(page)
	start := strings.Index(raw, `data-srcdoc="`) + len(`data-srcdoc="`)
	end := strings.Index(raw[start:], `"`)
	if html.UnescapeString(raw[start:start+end]) != got {
		t.Fatal("the canvas attribute ends early")
	}
	// The measure script is the canvas viewer's, not the prototype's.
	if strings.Contains(got, viewerFile(t, "measure.js")) {
		t.Fatal("the prototype canvas carries the board's measure script")
	}
}

// A file with a group holds the canvas once, escaped with the srcdoc rule, whatever the number of frames.
func TestAssemblePrototypeHoldsTheCanvasOnce(t *testing.T) {
	marker := `<p class="once">&amp; "x" ` + strings.Repeat("y", 4096) + `</p>`
	canvas := "<!doctype html><html><head></head><body>" + marker + "</body></html>"
	var frames []ProtoFrame
	for _, id := range []string{"a", "b", "c", "d"} {
		frames = append(frames, ProtoFrame{ID: id})
	}
	page, err := AssemblePrototype(Meta{Name: "n", Width: 100}, Proto{Frame: "b", Frames: frames}, []byte(canvas))
	if err != nil {
		t.Fatal(err)
	}
	escaped := attributeEscaper.Replace(marker)
	if n := strings.Count(string(page), escaped); n != 1 {
		t.Fatalf("the canvas is in the page %d times", n)
	}
	if strings.Contains(string(page), marker) {
		t.Fatal("an unescaped copy of the canvas is in the page")
	}
	if n := strings.Count(string(page), attributeEscaper.Replace(viewerFile(t, "isolate.js"))); n != 1 {
		t.Fatalf("isolate.js is in the page %d times", n)
	}
}

// Markup that ends a script or a template in the canvas stays inside the attribute (POSTMORTEM 2026-11-09 'Export
// inlined the wrong file after a nested self-closing `<template/>`').
func TestAssemblePrototypeKeepsCanvasMarkupInsideTheAttribute(t *testing.T) {
	for _, body := range []string{
		`<script>const s = "</script" + ">";</script></script>`,
		`<template/><template><p>x</p></template></template>`,
		`</template><div data-doan-frame="checkout"></div><!-- </div> -->`,
		`<script type="application/json" id="doan-prototype">{"start":"evil"}</script><div id="canvas" data-srcdoc="x"></div>`,
	} {
		canvas := "<!doctype html><html><head></head><body>" + body + "</body></html>"
		page, err := AssemblePrototype(Meta{Name: "n", Width: 100}, checkout, []byte(canvas))
		if err != nil {
			t.Fatal(err)
		}
		p := parsePrototype(t, page)
		if p.holders != 1 || p.metas != 1 || p.iframes != 0 {
			t.Fatalf("%q: holders %d group scripts %d iframes %d", body, p.holders, p.metas, p.iframes)
		}
		if g := p.group(t); g.Start != "checkout" {
			t.Fatalf("%q: group %+v", body, g)
		}
		script := isolateScript(t, p.canvas)
		if strings.Replace(p.canvas, script, "", 1) != canvas {
			t.Fatalf("%q: canvas bytes changed: %q", body, p.canvas)
		}
		if p.title != "Checkout — Prototype" || len(p.noscripts) != 2 {
			t.Fatalf("%q: title %q noscripts %q", body, p.title, p.noscripts)
		}
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
	if strings.Contains(parsePrototype(t, page).canvas, "\ufeff") {
		t.Fatal("the BOM survived")
	}
}

func TestAssemblePrototypeRefusesAStartOutsideItsGroup(t *testing.T) {
	for _, p := range []Proto{
		{Frames: []ProtoFrame{{ID: "checkout", Title: "Checkout"}}},
		{Frame: "checkout"},
		{Frame: "checkout", Frames: []ProtoFrame{{ID: "cart"}}},
	} {
		if _, err := AssemblePrototype(Meta{Name: "n", Width: 100}, p, []byte(simpleCanvas)); err == nil {
			t.Fatalf("%+v was accepted", p)
		}
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
		{"bom", "\xef\xbb\xbf<!doctype html><p title='\"&amp;'>{{NAME}}</p>", Proto{Frame: "a", Frames: []ProtoFrame{{ID: "a", Title: `a "&" <b>`}}}, "9724957bb6314aa377b5b2a4e837d460062a803e6d1b9ae9d55d7b1a5aae2953"},
		{"bare", "<p>a & \"b\"</p>", Proto{Frame: "x</script>", Frames: []ProtoFrame{{ID: "x</script>"}}}, "bed5b7469c80ab761c4e2fc7e459a13c5c041e7f06de904d0d2dfe0176525cf3"},
		{"empty", "", checkout, "fbd67f3b31ad1d254216966b6f17aa1e37f6f10e5b242c1c3c37bb83ad984303"},
		{"group", "<p>g</p>", Proto{Frame: "b", Frames: []ProtoFrame{{ID: "a", Title: "A"}, {ID: "b"}, {ID: "c d", Title: "C & D"}}}, "7bad6b7df0a289323e6f3005ed47e510a8f5efe7472e02b84f254a965b0cd6bc"},
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
