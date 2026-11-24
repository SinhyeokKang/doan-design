package export

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"strings"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
	"github.com/SinhyeokKang/doan-design/cli/internal/export/exporttest"
)

// The player's one escape function (player.js srcdocAttribute) and this file's are held to the same table, which
// exportViewer.test.ts reads too: the browser writes the srcdoc attribute as the CLI does.
func TestSrcdocEscapeIsTheSharedTable(t *testing.T) {
	b, err := os.ReadFile("testdata/srcdoc-escape.json")
	if err != nil {
		t.Fatal(err)
	}
	var table struct {
		Cases []struct{ Text, Attribute string }
	}
	if err := json.Unmarshal(b, &table); err != nil {
		t.Fatal(err)
	}
	amp, quot := false, false
	for _, c := range table.Cases {
		if got := attributeEscaper.Replace(c.Text); got != c.Attribute {
			t.Errorf("attributeEscaper(%q) = %q, want %q", c.Text, got, c.Attribute)
		}
		var out bytes.Buffer
		writeEscaped(&out, []byte(c.Text))
		if out.String() != c.Attribute {
			t.Errorf("writeEscaped(%q) = %q, want %q", c.Text, out.String(), c.Attribute)
		}
		amp = amp || strings.Contains(c.Text, "&")
		quot = quot || strings.Contains(c.Text, `"`)
	}
	if !amp || !quot || len(table.Cases) < 10 {
		t.Fatal("the table must cover both escaped characters")
	}
}

// The player's toast adds the app's internet sentence under the app's condition: the file still loads an internet
// URL. The CLI counts them while inlining (Inline's External); the page carries the count for the player.
func TestAssembleCarriesTheExternalCount(t *testing.T) {
	src := doc(`<div data-doan-frame="f" data-doan-prototype="1x1"></div>`)
	model, err := canvas.Parse(".doan/canvases/board.html", []byte(src))
	if err != nil {
		t.Fatal(err)
	}
	for _, n := range []int{0, 3} {
		m := playerMeta
		m.External = n
		page, err := Assemble(m, model, []byte(src))
		if err != nil {
			t.Fatal(err)
		}
		if got := prototypeData(t, page).External; got != n {
			t.Fatalf("external %d, want %d", got, n)
		}
	}
}

// playerJoin runs the player's own join (player.js prototypeExport, srcdocSlices) in Node over each request, as a
// browser would over the page's META and the board iframe's srcdoc, and returns its answers.
func playerJoin(t *testing.T, requests []map[string]any) []struct {
	Kind, Reason, File string
	Linked             int
} {
	t.Helper()
	node, err := exec.LookPath("node")
	if err != nil {
		t.Fatal("node is needed to run the viewer's player.js: ", err)
	}
	input, err := json.Marshal(requests)
	if err != nil {
		t.Fatal(err)
	}
	const script = `const { readFileSync } = require("node:fs");
const { runInNewContext } = require("node:vm");
const p = runInNewContext(readFileSync(process.argv[1], "utf8") + "\n({ prototypeExport, srcdocSlices })", {});
const out = JSON.parse(readFileSync(0, "utf8")).map(({ proto, srcdoc, font, id, size }) => {
  const plan = p.prototypeExport(proto, srcdoc, id, font);
  if (plan.kind !== "file") return plan;
  return { kind: plan.kind, linked: plan.linked, file: plan.head + [...p.srcdocSlices(plan.canvas, size)].join("") + plan.tail };
});
process.stdout.write(JSON.stringify(out));`
	cmd := exec.Command(node, "-e", script, "viewer/player.js")
	cmd.Stdin = bytes.NewReader(input)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	stdout, err := cmd.Output()
	if err != nil {
		t.Fatalf("node: %v\n%s", err, stderr.String())
	}
	var answers []struct {
		Kind, Reason, File string
		Linked             int
	}
	if err := json.Unmarshal(stdout, &answers); err != nil {
		t.Fatal(err)
	}
	if len(answers) != len(requests) {
		t.Fatalf("%d answers for %d requests", len(answers), len(requests))
	}
	return answers
}

func pageProto(t *testing.T, page []byte) (srcdoc, font string, proto map[string]any) {
	t.Helper()
	g, err := exporttest.ReadGeneral(page)
	if err != nil {
		t.Fatal(err)
	}
	var meta struct{ Prototype map[string]any }
	if err := json.Unmarshal([]byte(g.MetaJSON), &meta); err != nil || meta.Prototype == nil {
		t.Fatalf("no prototype data: %v", err)
	}
	return g.Srcdoc, g.Font, meta.Prototype
}

// The file the player downloads is the file `doan export --frame <id> --prototype` writes: byte for byte for these
// LF-only, valid UTF-8 canvases, for every frame the CLI exports, with slices small enough to split surrogate pairs
// and the player's own size. The player's code runs, not a copy of it (POSTMORTEM 2026-11-14 'An eval check that
// compared a prototype export only with a regenerated one accepted the canvas viewer': the file's own properties
// are checked by TestAssembleStitchedPrototypeIsAssemblePrototype over the same join).
func TestPlayerJoinsTheCLIsPrototypeFile(t *testing.T) {
	var requests []map[string]any
	var wants []string
	var linked []int
	for _, src := range stitchCanvases {
		page, model := general(t, src)
		srcdoc, font, proto := pageProto(t, page)
		for _, f := range model.Frames {
			if !canvas.Playable(model, f.ID) {
				continue
			}
			group := ProtoGroup(model, f.ID)
			want, err := AssemblePrototype(playerMeta, group, []byte(src))
			if err != nil {
				t.Fatal(err)
			}
			for _, size := range []int{7, 1 << 20} {
				requests = append(requests, map[string]any{"proto": proto, "srcdoc": srcdoc, "font": font, "id": f.ID, "size": size})
				wants = append(wants, string(want))
				linked = append(linked, len(group.Frames)-1)
			}
		}
	}
	for i, a := range playerJoin(t, requests) {
		id := requests[i]["id"]
		if a.Kind != "file" {
			t.Fatalf("%q: %s %s", id, a.Kind, a.Reason)
		}
		if a.File != wants[i] {
			t.Fatalf("%q (slices of %v): the player's file differs from AssemblePrototype (%d bytes, want %d)", id, requests[i]["size"], len(a.File), len(wants[i]))
		}
		if a.Linked != linked[i] {
			t.Fatalf("%q: %d linked frames, want %d", id, a.Linked, linked[i])
		}
	}
}

// The player refuses what the CLI refuses, by the file's own data, and looks ids up as keys of nothing: an id that
// names an Object.prototype member is an id like any other. It refuses a page whose data does not hold together
// rather than download a broken file.
func TestPlayerRefusesWhatTheCLIRefuses(t *testing.T) {
	src := doc(`<div data-doan-frame="dup" data-doan-prototype="1x1"></div><div data-doan-frame="dup" data-doan-prototype="1x1"></div>` +
		`<div data-doan-frame="plain"></div><div data-doan-frame="bad" data-doan-prototype="0x0"></div>` +
		`<div data-doan-frame="__proto__" data-doan-title="Proto" data-doan-prototype="1x1"><a data-doan-goto="ok">ok</a></div>` +
		`<div data-doan-frame="ok" data-doan-prototype="1x1"></div><div data-doan-frame="constructor"></div>`)
	page, _ := general(t, src)
	srcdoc, font, proto := pageProto(t, page)
	with := func(change func(p map[string]any)) map[string]any {
		b, err := json.Marshal(proto)
		if err != nil {
			t.Fatal(err)
		}
		var p map[string]any
		if err := json.Unmarshal(b, &p); err != nil {
			t.Fatal(err)
		}
		change(p)
		return p
	}
	measure := proto["measure"].(map[string]any)
	offset, length := measure["offset"].(float64), measure["length"].(float64)
	setMeasure := func(o, n any) func(map[string]any) {
		return func(p map[string]any) { p["measure"] = map[string]any{"offset": o, "length": n} }
	}
	cases := []struct {
		name, id string
		proto    map[string]any
		srcdoc   string
		want     string
	}{
		{"a frame the file has twice is not in it", "dup", proto, srcdoc, "missing"},
		{"a frame a script made", "script-made", proto, srcdoc, "missing"},
		{"an Object.prototype name the file does not have", "toString", proto, srcdoc, "missing"},
		{"hasOwnProperty", "hasOwnProperty", proto, srcdoc, "missing"},
		{"an unmarked frame", "plain", proto, srcdoc, "unmarked"},
		{"an invalid mark", "bad", proto, srcdoc, "unmarked"},
		{"an unmarked frame named constructor", "constructor", proto, srcdoc, "unmarked"},
		{"a measure range one unit off", "ok", with(setMeasure(offset+1, length)), srcdoc, "broken"},
		{"a measure range past the end", "ok", with(setMeasure(offset, float64(len(srcdoc)))), srcdoc, "broken"},
		{"a negative offset", "ok", with(setMeasure(-1, length)), srcdoc, "broken"},
		{"an offset that is no integer", "ok", with(setMeasure(offset+0.5, length)), srcdoc, "broken"},
		{"an offset that is text", "ok", with(setMeasure("0", length)), srcdoc, "broken"},
		{"a srcdoc that changed before the measure script", "ok", proto, "<!-- -->" + srcdoc, "broken"},
		{"no page cut in six", "ok", with(func(p map[string]any) { p["page"] = p["page"].([]any)[:5] }), srcdoc, "broken"},
		{"a group out of range", "ok", with(func(p map[string]any) {
			for _, f := range p["frames"].([]any) {
				f.(map[string]any)["group"] = float64(99)
			}
		}), srcdoc, "broken"},
		{"no frame list", "ok", with(func(p map[string]any) { delete(p, "frames") }), srcdoc, "broken"},
	}
	requests := []map[string]any{}
	for _, c := range cases {
		requests = append(requests, map[string]any{"proto": c.proto, "srcdoc": c.srcdoc, "font": font, "id": c.id, "size": 1 << 20})
	}
	// A page with no font style to join in: the player reads none (not text).
	requests = append(requests, map[string]any{"proto": proto, "srcdoc": srcdoc, "font": nil, "id": "ok", "size": 1 << 20})
	// The same data, untouched, exports both frames of the __proto__ group.
	requests = append(requests, map[string]any{"proto": proto, "srcdoc": srcdoc, "font": font, "id": "__proto__", "size": 1 << 20})
	answers := playerJoin(t, requests)
	for i, c := range cases {
		if answers[i].Kind != "refused" || answers[i].Reason != c.want {
			t.Errorf("%s: %s %q, want refused %q", c.name, answers[i].Kind, answers[i].Reason, c.want)
		}
	}
	if a := answers[len(cases)]; a.Kind != "refused" || a.Reason != "broken" {
		t.Errorf("no font style: %s %q, want refused \"broken\"", a.Kind, a.Reason)
	}
	last := answers[len(answers)-1]
	if last.Kind != "file" || last.Linked != 1 || !strings.Contains(last.File, "<title>Proto — Prototype</title>") {
		t.Fatalf("__proto__: %s %q linked %d", last.Kind, last.Reason, last.Linked)
	}
}
