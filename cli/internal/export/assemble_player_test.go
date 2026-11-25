package export

import (
	"encoding/json"
	"fmt"
	"html"
	"os"
	"reflect"
	"sort"
	"strings"
	"testing"
	"unicode/utf16"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
	"github.com/SinhyeokKang/doan-design/cli/internal/export/exporttest"
	nethtml "golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

var playerMeta = Meta{Project: "Store", Name: "board", Width: 800}

// general assembles the general Export page of src as `doan export` does, the frame data judged from src itself.
func general(t *testing.T, src string) ([]byte, canvas.Canvas) {
	t.Helper()
	model, err := canvas.Parse(".doan/canvases/board.html", []byte(src))
	if err != nil {
		t.Fatal(err)
	}
	page, err := Assemble(playerMeta, model, []byte(src))
	if err != nil {
		t.Fatal(err)
	}
	return page, model
}

func prototypeData(t *testing.T, page []byte) *exporttest.PrototypeData {
	t.Helper()
	g, err := exporttest.ReadGeneral(page)
	if err != nil {
		t.Fatal(err)
	}
	if g.Meta.Prototype == nil {
		t.Fatal("the general Export carries no prototype data")
	}
	return g.Meta.Prototype
}

func exportableIDs(p *exporttest.PrototypeData) []string {
	ids := []string{}
	for _, f := range p.Frames {
		ids = append(ids, f.ID)
	}
	return ids
}

func refusedPairs(p *exporttest.PrototypeData) [][2]string {
	out := [][2]string{}
	for _, r := range p.Refused {
		out = append(out, [2]string{r.ID, r.Reason})
	}
	return out
}

// groupIDs decodes each group's frames JSON to its ids.
func groupIDs(t *testing.T, p *exporttest.PrototypeData) [][]string {
	t.Helper()
	out := [][]string{}
	for _, g := range p.Groups {
		var frames []struct{ ID, Title string }
		if err := json.Unmarshal([]byte(g), &frames); err != nil {
			t.Fatalf("group %q: %v", g, err)
		}
		ids := []string{}
		for _, f := range frames {
			ids = append(ids, f.ID)
		}
		out = append(out, ids)
	}
	return out
}

func doc(body string) string {
	return "<!doctype html>\n<html><head><meta charset=\"utf-8\"><title>t</title></head><body>\n" + body + "\n</body></html>\n"
}

const flowBody = `<div data-doan-frame="about" data-doan-title="About" data-doan-prototype="390x844"><a data-doan-goto="team">Team</a></div>` +
	`<div data-doan-frame="pay" data-doan-prototype="390x844"><button data-doan-goto="plain">Draft</button></div>` +
	`<div data-doan-frame="home" data-doan-title="Home" data-doan-prototype="390x844"><a data-doan-goto="cart">Cart</a><a data-doan-goto="nope">Gone</a></div>` +
	`<div data-doan-frame="team" data-doan-prototype="390x844"></div>` +
	`<div data-doan-frame="cart" data-doan-title="Cart &amp; bag" data-doan-prototype="390x844"><a data-doan-goto="pay">Pay</a></div>` +
	`<div data-doan-frame="alone" data-doan-title="Alone" data-doan-prototype="390x844"></div>` +
	`<div data-doan-frame="plain"><a data-doan-goto="alone">Alone</a></div>` +
	`<a data-doan-goto="home">Outside</a>`

// LF-only, valid UTF-8 canvases: for these the file the viewer stitches must be the CLI's, byte for byte.
var stitchCanvases = map[string]string{
	"flow": doc(flowBody),
	"hostile titles and ids": doc(`<div data-doan-frame="a" data-doan-title="&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;q&quot; 'a' &lt;!-- 공백" data-doan-prototype="390x844"><a data-doan-goto="&lt;/script&gt;&lt;!-- &quot;x&quot; &amp; 'y'` + " " + `">x</a></div>` +
		`<div data-doan-frame="&lt;/script&gt;&lt;!-- &quot;x&quot; &amp; 'y'` + " " + `" data-doan-prototype="1x1"><a data-doan-goto="{{SRCDOC}}">y</a></div>` +
		`<div data-doan-frame="{{SRCDOC}}" data-doan-title="{{NAME}} {{META}}" data-doan-prototype="1x1"></div>` +
		`<div data-doan-frame="a b%20#?` + strings.Repeat("\U0001F98A", 2) + `" data-doan-title="" data-doan-prototype="2x2"></div>`),
	"canvas markup": doc(`<script>const s = "</script" + ">"; const t = '<script>(function () {\n';</script>` +
		`<template/><template><div data-doan-frame="inert" data-doan-prototype="1x1"></div></template></template>` +
		`<p title="say &quot;x&quot;" data-x='srcdoc="y"'>it's "q" &lt;tag&gt; &amp; 한글 {{NAME}} {{SRCDOC}}</p>` +
		`<div data-doan-frame="live" data-doan-prototype="390x844"></div>`),
	"no head":    "<!doctype html><html><body><div data-doan-frame=\"f\" data-doan-prototype=\"1x1\"></div></body></html>",
	"no doctype": "<div data-doan-frame=\"f\" data-doan-prototype=\"1x1\"></div>",
	"bom":        "\ufeff" + doc(`<div data-doan-frame="f" data-doan-title="F" data-doan-prototype="1x1"></div>`),
	"attributes": "<!DOCTYPE html>\n<html lang=\"ko\">\n<head lang=\"ko\">\n<title>x</title></head><body><div data-doan-frame=\"f\" data-doan-prototype=\"1x1\"></div></body></html>\n",
}

// The viewer only joins the general Export's fragments; the result must be the file `doan export --frame <id>
// --prototype` writes, for every exportable frame, found from the canvas model rather than the data under test.
func TestAssembleStitchedPrototypeIsAssemblePrototype(t *testing.T) {
	for name, src := range stitchCanvases {
		t.Run(name, func(t *testing.T) {
			page, model := general(t, src)
			played := 0
			for _, f := range model.Frames {
				if !canvas.Playable(model, f.ID) {
					continue
				}
				played++
				want, err := AssemblePrototype(playerMeta, ProtoGroup(model, f.ID), []byte(src))
				if err != nil {
					t.Fatal(err)
				}
				got, err := exporttest.StitchPrototype(page, f.ID)
				if err != nil {
					t.Fatalf("%q: %v", f.ID, err)
				}
				if string(got) != string(want) {
					t.Fatalf("%q: stitched file differs from AssemblePrototype (%d bytes, want %d)", f.ID, len(got), len(want))
				}
				// Properties a prototype file has whatever the run under test wrote, so the canvas viewer cannot pass as one.
				p := parsePrototype(t, got)
				label := f.ID
				if f.Title != nil && *f.Title != "" {
					label = *f.Title
				}
				if p.title != label+" — Prototype" || len(p.noscripts) != 2 || p.iframes != 0 || p.holders != 1 {
					t.Fatalf("%q: title %q noscripts %d iframes %d holders %d", f.ID, p.title, len(p.noscripts), p.iframes, p.holders)
				}
				if g := p.group(t); g.Start != f.ID {
					t.Fatalf("%q: start %q", f.ID, g.Start)
				}
				if strings.Replace(p.canvas, isolateScript(t, p.canvas), "", 1) != strings.TrimPrefix(src, "\ufeff") {
					t.Fatalf("%q: the stitched canvas changed", f.ID)
				}
			}
			if played == 0 {
				t.Fatal("no frame to stitch")
			}
		})
	}
}

// Past the LF-only, valid UTF-8 case the HTML parser normalizes the srcdoc, so the stitched file is judged by its
// parse: the same title, group and canvas as the CLI's.
func TestAssembleStitchesACRLFCanvasToTheSameParse(t *testing.T) {
	src := "<!doctype html>\r\n<html lang=\"en\">\r\n<head>\r\n<title>x</title></head><body>\r\n" +
		`<div data-doan-frame="a" data-doan-title="A" data-doan-prototype="1x1"><a data-doan-goto="b">b</a></div>` + "\r\n" +
		`<div data-doan-frame="b" data-doan-prototype="1x1"></div>` + "\r\n\r</body></html>\r\n"
	page, model := general(t, src)
	for _, id := range []string{"a", "b"} {
		want, err := AssemblePrototype(playerMeta, ProtoGroup(model, id), []byte(src))
		if err != nil {
			t.Fatal(err)
		}
		got, err := exporttest.StitchPrototype(page, id)
		if err != nil {
			t.Fatal(err)
		}
		g, w := parsePrototype(t, got), parsePrototype(t, want)
		if g.title != w.title || g.meta != w.meta || g.canvas != w.canvas || !reflect.DeepEqual(g.noscripts, w.noscripts) {
			t.Fatalf("%q: the stitched file parses differently from AssemblePrototype", id)
		}
	}
}

// browserUnits counts what a browser's string holds for bytes in an attribute value of a UTF-8 page: the WHATWG
// decoder's one U+FFFD per maximal invalid subpart, and CR LF read as one LF.
func TestBrowserUnits(t *testing.T) {
	for _, c := range []struct {
		in   string
		want int
	}{
		{"", 0},
		{"<!doctype html>", 15},
		{"\r\n", 1},
		{"\r", 1},
		{"\n\r\n\r", 3},
		{"\x00", 1},
		{"한", 1},
		{"\U0001F98A", 2},
		{"\xE2\x82\xAC", 1},
		{"\xE2\x82", 1},
		{"\xE2\x82<", 2},
		{"\xF0\x80", 2},
		{"\xF0\x90\x80", 1},
		{"\xED\xA0\x80", 3},
		{"\xC0\xAF", 2},
		{"\xF4\x90\x80\x80", 4},
		{"\xFF", 1},
		{"\x80\x80", 2},
		{"\xE0\x80\xAF", 3},
		{"\xF4\x8F\xBF\xBF", 2},
	} {
		if got := browserUnits([]byte(c.in)); got != c.want {
			t.Errorf("browserUnits(%q) = %d, want %d", c.in, got, c.want)
		}
	}
}

// The measure range is in the units a browser's srcdoc string has, so a CR LF or a broken byte before the head
// does not move it.
func TestAssembleMeasureRangeCountsWhatTheBrowserDecodes(t *testing.T) {
	src := "<!doctype html>\r\n<html lang=\"\xE2\x82\">\r\n<head>\r\n<title>x</title></head><body></body></html>"
	page, _ := general(t, src)
	p := prototypeData(t, page)
	decodedPrefix := "<!doctype html>\n<html lang=\"�\">\n<head>"
	if want := len(utf16.Encode([]rune(decodedPrefix))); p.Measure.Offset != want {
		t.Fatalf("offset %d, want %d", p.Measure.Offset, want)
	}
	script := "<script>(function () {\n" + strings.Join([]string{viewerFile(t, "lib.js"), viewerFile(t, "inspect.js"), viewerFile(t, "inspectSelection.js"), viewerFile(t, "measure.js")}, "\n") + "\n})();</script>"
	if want := len(utf16.Encode([]rune(script))); p.Measure.Length != want {
		t.Fatalf("length %d, want %d", p.Measure.Length, want)
	}
	// On a valid canvas the range is exactly the measure script in the srcdoc the browser reads.
	page, _ = general(t, doc(`<p>한글 `+strings.Repeat("\U0001F98A", 3)+`</p>`))
	g, err := exporttest.ReadGeneral(page)
	if err != nil {
		t.Fatal(err)
	}
	units := utf16.Encode([]rune(g.Srcdoc))
	m := g.Meta.Prototype.Measure
	if string(utf16.Decode(units[m.Offset:m.Offset+m.Length])) != script {
		t.Fatal("the measure range is not the measure script")
	}
}

// The prototype page's template, style and scripts are in the general Export once, as JSON text, so neither a
// browser nor a check looking for a prototype file's markers takes the general Export for one.
func TestAssembleHoldsThePrototypePageOnceAsData(t *testing.T) {
	page, _ := general(t, doc(flowBody))
	raw := string(page)
	for _, name := range []string{"prototype.js", "prototype.css", "isolate.js"} {
		encoded, err := json.Marshal(viewerFile(t, name))
		if err != nil {
			t.Fatal(err)
		}
		body := strings.Trim(string(encoded), `"`)
		if n := strings.Count(raw, body); n != 1 {
			t.Fatalf("%s is in the general Export %d times", name, n)
		}
	}
	p := prototypeData(t, page)
	joined := strings.Join(p.Page, "")
	if !strings.HasPrefix(p.Page[0], "<!doctype html>") || !strings.Contains(p.Page[0], "<title>") || !strings.HasPrefix(p.Page[1], " — Prototype</title>") {
		t.Fatalf("the template is not cut at its title: %.120q | %.120q", p.Page[0], p.Page[1])
	}
	// The font style is cut out too: the viewer file carries the face once, in its own font style, which the player
	// joins back in.
	if len(p.Page) != 6 || !strings.HasSuffix(p.Page[1], `<style id="doan-font">`) || !strings.HasPrefix(p.Page[2], "</style>") {
		t.Fatalf("the template is not cut at its font style")
	}
	if !strings.HasSuffix(p.Page[2], `<script type="application/json" id="doan-prototype">{"start":`) || p.Page[3] != `,"frames":` || !strings.HasPrefix(p.Page[4], "}</script>") || !strings.HasSuffix(p.Page[4], `data-srcdoc="`) || !strings.HasPrefix(p.Page[5], `"></div>`) {
		t.Fatalf("the template is not cut at its group and canvas")
	}
	if strings.Contains(joined, "{{") || !strings.Contains(joined, viewerFile(t, "prototype.js")) || !strings.Contains(joined, viewerFile(t, "prototype.css")) {
		t.Fatal("the template is not filled with the prototype style and script")
	}
	if want := "<script>(function () {\n" + viewerFile(t, "isolate.js") + "\n})();</script>"; p.Isolate != want {
		t.Fatal("the isolation script is not isolate.js in one function")
	}
	// The general Export is still the canvas viewer page and only that.
	if strings.Contains(raw, "— Prototype</title>") || strings.Contains(raw, "Open this file in a web browser to play this prototype.</span></p></noscript>") || strings.Contains(raw, `id="doan-prototype"`) || strings.Contains(raw, `data-srcdoc="`) {
		t.Fatal("the general Export carries prototype markup")
	}
	parsed, err := nethtml.Parse(strings.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	iframes, metas, groups, holders := 0, 0, 0, 0
	var visit func(*nethtml.Node)
	visit = func(n *nethtml.Node) {
		if n.Type == nethtml.ElementNode {
			switch {
			case n.DataAtom == atom.Iframe:
				iframes++
			case n.DataAtom == atom.Script && attr(n, "id") == "doan-meta":
				metas++
			case n.DataAtom == atom.Script && attr(n, "id") == "doan-prototype":
				groups++
			case attr(n, "data-srcdoc") != "":
				holders++
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			visit(c)
		}
	}
	visit(parsed)
	if iframes != 1 || metas != 1 || groups != 0 || holders != 0 {
		t.Fatalf("iframes %d meta scripts %d group scripts %d holders %d", iframes, metas, groups, holders)
	}
}

// NAME, start and the group JSON are pre-rendered by Go, so the browser never escapes them; each is the string
// AssemblePrototype writes.
func TestAssembleFrameFragmentsAreAssemblePrototypes(t *testing.T) {
	src := stitchCanvases["hostile titles and ids"]
	page, model := general(t, src)
	p := prototypeData(t, page)
	if len(p.Frames) != 4 {
		t.Fatalf("frames %q", exportableIDs(p))
	}
	for _, f := range p.Frames {
		played, refusal := canvas.PrototypeTarget(model, f.ID)
		if refusal != canvas.PrototypeOK {
			t.Fatalf("%q exported but refused by the CLI", f.ID)
		}
		label := f.ID
		if played.Title != nil && *played.Title != "" {
			label = *played.Title
		}
		if f.Name != html.EscapeString(label) {
			t.Fatalf("%q: name %q", f.ID, f.Name)
		}
		var start string
		if err := json.Unmarshal([]byte(f.Start), &start); err != nil || start != f.ID {
			t.Fatalf("%q: start %q", f.ID, f.Start)
		}
		for _, text := range []string{f.Start, p.Groups[f.Group]} {
			if strings.ContainsAny(text, "<>&") || strings.Contains(text, " ") {
				t.Fatalf("%q: %q could end its script", f.ID, text)
			}
		}
		want, err := AssemblePrototype(playerMeta, ProtoGroup(model, f.ID), []byte(src))
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(want), "<title>"+f.Name+" — Prototype</title>") {
			t.Fatalf("%q: AssemblePrototype names the frame otherwise", f.ID)
		}
		if parsePrototype(t, want).meta != `{"start":`+f.Start+`,"frames":`+p.Groups[f.Group]+`}` {
			t.Fatalf("%q: AssemblePrototype writes another group JSON", f.ID)
		}
	}
}

// Go's groups and its exportable frames follow the shared link fixture, which the app's TypeScript judgment reads too.
func TestAssemblePrototypeDataFollowsTheLinkFixture(t *testing.T) {
	var fx struct {
		Placements []struct {
			Name, HTML string
			Groups     [][]string
		}
	}
	data, err := os.ReadFile("../../../schema/fixtures/prototype-links/cases.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &fx); err != nil || len(fx.Placements) == 0 {
		t.Fatal("no fixtures", err)
	}
	for _, c := range fx.Placements {
		t.Run(c.Name, func(t *testing.T) {
			page, _ := general(t, doc(c.HTML))
			p := prototypeData(t, page)
			want := [][]string{}
			flat := []string{}
			for _, g := range c.Groups {
				want = append(want, append([]string{}, g...))
				flat = append(flat, g...)
			}
			if got := groupIDs(t, p); !reflect.DeepEqual(got, want) {
				t.Fatalf("groups %q, want %q", got, want)
			}
			got := exportableIDs(p)
			sort.Strings(got)
			sort.Strings(flat)
			if !reflect.DeepEqual(got, flat) {
				t.Fatalf("exportable %q, want the grouped frames %q", got, flat)
			}
			for _, f := range p.Frames {
				if f.Group < 0 || f.Group >= len(want) || !contains(want[f.Group], f.ID) {
					t.Fatalf("%q points at group %d", f.ID, f.Group)
				}
			}
		})
	}
}

// A frame's mark decides whether the file lets it be exported: the shared mark fixture's placements.
func TestAssemblePrototypeDataFollowsTheMarkFixture(t *testing.T) {
	var fx struct {
		Values []struct {
			Value string
			Valid bool
		}
		Placements []struct {
			Name, HTML string
			Frames     []struct {
				ID        string
				Prototype *string
			}
		}
	}
	data, err := os.ReadFile("../../../schema/fixtures/prototype-mark/cases.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &fx); err != nil || len(fx.Placements) == 0 {
		t.Fatal("no fixtures", err)
	}
	valid := map[string]bool{}
	for _, v := range fx.Values {
		valid[v.Value] = v.Valid
	}
	for _, c := range fx.Placements {
		t.Run(c.Name, func(t *testing.T) {
			page, _ := general(t, doc(c.HTML))
			p := prototypeData(t, page)
			count := map[string]int{}
			for _, f := range c.Frames {
				count[f.ID]++
			}
			wantFrames, wantRefused, seen := []string{}, [][2]string{}, map[string]bool{}
			for _, f := range c.Frames {
				if f.ID == "" || seen[f.ID] {
					continue
				}
				seen[f.ID] = true
				switch {
				case count[f.ID] > 1:
					wantRefused = append(wantRefused, [2]string{f.ID, "shared"})
				case f.Prototype == nil:
					wantRefused = append(wantRefused, [2]string{f.ID, "unmarked"})
				default:
					ok, known := valid[*f.Prototype]
					if !known {
						ok = canvas.PrototypeSizeValid(*f.Prototype)
					}
					if ok {
						wantFrames = append(wantFrames, f.ID)
					} else {
						wantRefused = append(wantRefused, [2]string{f.ID, "unmarked"})
					}
				}
			}
			if got := exportableIDs(p); !reflect.DeepEqual(got, wantFrames) {
				t.Fatalf("exportable %q, want %q", got, wantFrames)
			}
			if got := refusedPairs(p); !reflect.DeepEqual(got, wantRefused) {
				t.Fatalf("refused %q, want %q", got, wantRefused)
			}
		})
	}
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

// The file decides what can be exported: a shared id once with its reason, an unmarked or wrongly marked frame as
// unmarked, and script-made, template-held or over-200-unit ids not at all (the viewer reads those as script-made).
func TestAssembleJudgesSharedLongAndScriptFramesFromTheFile(t *testing.T) {
	at200 := strings.Repeat("\U0001F98A", 100)
	at201 := strings.Repeat("\U0001F98A", 100) + "a"
	src := doc(`<div data-doan-frame="twice" data-doan-prototype="390x844"></div>` +
		`<div data-doan-frame="plain"></div>` +
		`<div data-doan-frame="padded" data-doan-prototype="390x844 "></div>` +
		`<div data-doan-frame="twice"></div>` +
		`<div data-doan-frame="` + at200 + `" data-doan-prototype="1x1"></div>` +
		`<div data-doan-frame="` + at201 + `" data-doan-prototype="1x1"></div>` +
		`<div data-doan-frame="" data-doan-prototype="1x1"></div>` +
		`<template><div data-doan-frame="inert" data-doan-prototype="1x1"></div></template>` +
		`<script>document.body.insertAdjacentHTML("beforeend", '<div data-doan-frame="made" data-doan-prototype="1x1"></div>');</script>` +
		`<div data-doan-frame="ok" data-doan-prototype="1x1"></div>`)
	page, _ := general(t, src)
	p := prototypeData(t, page)
	if got := exportableIDs(p); !reflect.DeepEqual(got, []string{at200, "ok"}) {
		t.Fatalf("exportable %q", got)
	}
	if got := refusedPairs(p); !reflect.DeepEqual(got, [][2]string{{"twice", "shared"}, {"plain", "unmarked"}, {"padded", "unmarked"}}) {
		t.Fatalf("refused %q", got)
	}
	for _, id := range []string{"made", "inert", "twice", at201} {
		if _, err := exporttest.StitchPrototype(page, id); err == nil {
			t.Fatalf("%q was stitched", id)
		}
	}
}

// The file's group is not cut at the 1,000 frames the drawers list: the exported file reaches every linked frame,
// as `doan export --prototype` does.
func TestAssembleKeepsAGroupOverAThousandFramesUncut(t *testing.T) {
	var body strings.Builder
	for i := 0; i < 1001; i++ {
		fmt.Fprintf(&body, `<div data-doan-frame="f%d" data-doan-prototype="1x1"><a data-doan-goto="f%d"></a></div>`, i, (i+1)%1001)
	}
	src := doc(body.String())
	page, model := general(t, src)
	p := prototypeData(t, page)
	if len(p.Frames) != 1001 || len(p.Groups) != 1 || len(groupIDs(t, p)[0]) != 1001 {
		t.Fatalf("%d frames, %d groups", len(p.Frames), len(p.Groups))
	}
	want, err := AssemblePrototype(playerMeta, ProtoGroup(model, "f0"), []byte(src))
	if err != nil {
		t.Fatal(err)
	}
	if got, err := exporttest.StitchPrototype(page, "f0"); err != nil || string(got) != string(want) {
		t.Fatalf("f0 stitched differently: %v", err)
	}
}

// A canvas without frames still carries the lists, empty, so the viewer reads them without a null check.
func TestAssembleCarriesEmptyPrototypeListsForACanvasWithoutFrames(t *testing.T) {
	page, _ := general(t, doc("<p>x</p>"))
	g, err := exporttest.ReadGeneral(page)
	if err != nil {
		t.Fatal(err)
	}
	p := g.Meta.Prototype
	if p == nil || p.Frames == nil || p.Refused == nil || p.Groups == nil || len(p.Frames)+len(p.Refused)+len(p.Groups) != 0 {
		t.Fatalf("prototype %+v", p)
	}
	if g.Meta.Name != "board" || g.Meta.Width != 800 {
		t.Fatalf("meta %+v", g.Meta)
	}
}

// ProtoGroup is the one judgment of a prototype file's group, shared by `doan export --prototype` and the
// general Export: the start frame's uncut link group with each frame's title as the file states it.
func TestProtoGroupIsTheStartFramesLinkGroup(t *testing.T) {
	model, err := canvas.Parse(".doan/canvases/board.html", []byte(doc(flowBody)))
	if err != nil {
		t.Fatal(err)
	}
	got := ProtoGroup(model, "cart")
	want := Proto{Frame: "cart", Frames: []ProtoFrame{{ID: "pay"}, {ID: "home", Title: "Home"}, {ID: "cart", Title: "Cart & bag"}}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("%+v, want %+v", got, want)
	}
	if got := ProtoGroup(model, "alone"); !reflect.DeepEqual(got, Proto{Frame: "alone", Frames: []ProtoFrame{{ID: "alone", Title: "Alone"}}}) {
		t.Fatalf("%+v", got)
	}
}

// The player window sizes a run's viewport to its frame's mark before the run's own report comes, as the app's
// prototype window does with the board's mark, so each exportable frame carries its raw mark.
func TestAssembleCarriesEachExportableFramesMark(t *testing.T) {
	page, _ := general(t, doc(`<div data-doan-frame="phone" data-doan-prototype="390x844"></div>`+
		`<div data-doan-frame="tablet" data-doan-title="Tablet" data-doan-prototype="1024x768"></div>`+
		`<div data-doan-frame="plain"></div>`))
	p := prototypeData(t, page)
	got := map[string]string{}
	for _, f := range p.Frames {
		got[f.ID] = f.Mark
	}
	if want := map[string]string{"phone": "390x844", "tablet": "1024x768"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("marks %v, want %v", got, want)
	}
}
