package canvas

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

type linkFrame struct {
	ID        string
	Prototype *string
}

type linkFixtures struct {
	Placements []struct {
		Name, HTML string
		Frames     []linkFrame
		Gotos      []Goto
		Groups     [][]string
	}
	Groups []struct {
		Name   string
		Frames []linkFrame
		Gotos  []Goto
		Groups [][]string
	}
}

func readLinkFixtures(t *testing.T) linkFixtures {
	t.Helper()
	var fx linkFixtures
	data, err := os.ReadFile("../../../schema/fixtures/prototype-links/cases.json")
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(data, &fx); err != nil {
		t.Fatal(err)
	}
	if len(fx.Placements) == 0 || len(fx.Groups) == 0 {
		t.Fatal("no fixtures")
	}
	return fx
}

// normalGotos and normalGroups let an empty list and a missing one compare equal, so the tests pin
// content rather than how an implementation allocates.
func normalGotos(gs []Goto) []Goto {
	out := []Goto{}
	for _, g := range gs {
		frames := append([]string{}, g.Frames...)
		out = append(out, Goto{Value: g.Value, Frames: frames})
	}
	return out
}

func normalGroups(gs [][]string) [][]string {
	out := [][]string{}
	for _, g := range gs {
		out = append(out, append([]string{}, g...))
	}
	return out
}

func TestParseGotosFixture(t *testing.T) {
	for _, tt := range readLinkFixtures(t).Placements {
		t.Run(tt.Name, func(t *testing.T) {
			c, err := Parse(".doan/canvases/a.html", []byte(`<head></head><body>`+tt.HTML+`</body>`))
			if err != nil {
				t.Fatal(err)
			}
			frames := []linkFrame{}
			for _, f := range c.Frames {
				frames = append(frames, linkFrame{f.ID, f.Prototype})
			}
			if want := append([]linkFrame{}, tt.Frames...); !reflect.DeepEqual(frames, want) {
				t.Fatalf("frames %+v, want %+v", frames, want)
			}
			if got, want := normalGotos(c.Gotos), normalGotos(tt.Gotos); !reflect.DeepEqual(got, want) {
				t.Fatalf("gotos %q, want %q", got, want)
			}
		})
	}
}

func TestLinkGroupsPlacementsFixture(t *testing.T) {
	for _, tt := range readLinkFixtures(t).Placements {
		t.Run(tt.Name, func(t *testing.T) {
			c, err := Parse(".doan/canvases/a.html", []byte(`<head></head><body>`+tt.HTML+`</body>`))
			if err != nil {
				t.Fatal(err)
			}
			if got, want := normalGroups(LinkGroups(c)), normalGroups(tt.Groups); !reflect.DeepEqual(got, want) {
				t.Fatalf("groups %q, want %q", got, want)
			}
		})
	}
}

func TestLinkGroupsFixture(t *testing.T) {
	for _, tt := range readLinkFixtures(t).Groups {
		t.Run(tt.Name, func(t *testing.T) {
			c := Canvas{Gotos: tt.Gotos}
			for _, f := range tt.Frames {
				c.Frames = append(c.Frames, Frame{ID: f.ID, Prototype: f.Prototype})
			}
			if got, want := normalGroups(LinkGroups(c)), normalGroups(tt.Groups); !reflect.DeepEqual(got, want) {
				t.Fatalf("groups %q, want %q", got, want)
			}
		})
	}
}

// A body fragment cannot carry attributes for <head> or <body>, so these are pinned here only.
func TestParseGotosOnHeadAndBody(t *testing.T) {
	c, err := Parse(".doan/canvases/a.html", []byte(`<html><head data-doan-goto="a"></head><body data-doan-goto="b"><div data-doan-frame="a" data-doan-prototype="390x844"></div></body></html>`))
	if err != nil {
		t.Fatal(err)
	}
	want := []Goto{{Value: "a", Frames: []string{}}, {Value: "b", Frames: []string{}}}
	if got := normalGotos(c.Gotos); !reflect.DeepEqual(got, want) {
		t.Fatalf("gotos %q, want %q", got, want)
	}
}

// Frames are recorded per link, so a later sibling frame must not overwrite an earlier link's frames even
// when the enclosing stack has spare capacity.
func TestParseGotosKeepsEachLinksFrames(t *testing.T) {
	body := `<div data-doan-frame="a"><div data-doan-frame="b"><div data-doan-frame="c">` +
		`<div data-doan-frame="d"><i data-doan-goto="1"></i></div>` +
		`<div data-doan-frame="e"><i data-doan-goto="2"></i></div>` +
		`<div data-doan-frame="f"><i data-doan-goto="3"></i></div>` +
		`</div></div></div>`
	c, err := Parse(".doan/canvases/a.html", []byte(`<head></head><body>`+body+`</body>`))
	if err != nil {
		t.Fatal(err)
	}
	want := []Goto{
		{Value: "1", Frames: []string{"a", "b", "c", "d"}},
		{Value: "2", Frames: []string{"a", "b", "c", "e"}},
		{Value: "3", Frames: []string{"a", "b", "c", "f"}},
	}
	if !reflect.DeepEqual(normalGotos(c.Gotos), want) {
		t.Fatalf("gotos %q, want %q", c.Gotos, want)
	}
	c.Gotos[0].Frames[0] = "changed"
	if c.Gotos[1].Frames[0] != "a" {
		t.Fatal("links share a frames array")
	}
}

func TestPlayable(t *testing.T) {
	str := func(s string) *string { return &s }
	c := Canvas{Frames: []Frame{
		{ID: "a", Prototype: str("390x844")},
		{ID: "b"},
		{ID: "c", Prototype: str("390")},
		{ID: "d", Prototype: str("1x1")},
		{ID: "d", Prototype: str("1x1")},
		{ID: "", Prototype: str("390x844")},
	}}
	for id, want := range map[string]bool{"a": true, "b": false, "c": false, "d": false, "": false, "z": false} {
		if got := Playable(c, id); got != want {
			t.Errorf("Playable(%q) = %v, want %v", id, got, want)
		}
	}
}
