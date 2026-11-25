package export

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
)

// A frame is named by its title, else its id (PRODUCT), with the title trimmed as JavaScript's String.prototype.trim
// trims it, so export names frames as the app does: U+FEFF is trimmed, U+0085 is not.
func TestExportNamesFramesByTrimmedTitleElseID(t *testing.T) {
	src := doc(`<div data-doan-frame="hero" data-doan-title="  Hero &#xFEFF;" data-doan-prototype="1x1"><a data-doan-goto="blank">b</a><a data-doan-goto="nel">n</a></div>` +
		`<div data-doan-frame="blank" data-doan-title="&#xA0;&#x3000;&#xFEFF;&#x2028;" data-doan-prototype="1x1"></div>` +
		// Raw: the character reference &#x85; reads as U+2026.
		`<div data-doan-frame="nel" data-doan-title="` + "\u0085" + `Nel" data-doan-prototype="1x1"></div>`)
	c, err := canvas.Parse("c.html", []byte(src))
	if err != nil {
		t.Fatal(err)
	}
	want := []protoFrame{{"hero", "Hero"}, {"blank", "blank"}, {"nel", "\u0085Nel"}}

	exports, err := prototypeExports(c, []byte(src), "")
	if err != nil {
		t.Fatal(err)
	}
	var names []protoFrame
	for _, f := range exports.Frames {
		names = append(names, protoFrame{f.ID, f.Name})
	}
	if !reflect.DeepEqual(names, want) {
		t.Errorf("export list names = %q, want %q", names, want)
	}
	var group []protoFrame
	if len(exports.Groups) != 1 || json.Unmarshal([]byte(exports.Groups[0]), &group) != nil || !reflect.DeepEqual(group, want) {
		t.Errorf("group = %q, want %q", exports.Groups, want)
	}

	page, err := AssemblePrototype(Meta{Name: "n", Width: 100}, ProtoGroup(c, "hero"), []byte(src))
	if err != nil {
		t.Fatal(err)
	}
	p := parsePrototype(t, page)
	var pageGroup []protoFrame
	for _, f := range p.group(t).Frames {
		pageGroup = append(pageGroup, protoFrame{f.ID, f.Title})
	}
	if p.title != "Hero — Prototype" || !reflect.DeepEqual(pageGroup, want) {
		t.Errorf("prototype page title %q group %q", p.title, p.meta)
	}
}
