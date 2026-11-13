package canvas

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"
)

type prototypeFixtures struct {
	Values []struct {
		Name, Value string
		Valid       bool
	}
	Placements []struct {
		Name, HTML string
		Frames     []struct {
			ID        string
			Prototype *string
		}
		Stray []string
	}
}

func readPrototypeFixtures(t *testing.T) prototypeFixtures {
	t.Helper()
	var fx prototypeFixtures
	data, err := os.ReadFile("../../../schema/fixtures/prototype-mark/cases.json")
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(data, &fx); err != nil {
		t.Fatal(err)
	}
	if len(fx.Values) == 0 || len(fx.Placements) == 0 {
		t.Fatal("no fixtures")
	}
	return fx
}

func TestPrototypeSizeValidFixture(t *testing.T) {
	for _, tt := range readPrototypeFixtures(t).Values {
		t.Run(tt.Name, func(t *testing.T) {
			if got := PrototypeSizeValid(tt.Value); got != tt.Valid {
				t.Fatalf("%q: %v, want %v", tt.Value, got, tt.Valid)
			}
		})
	}
}

func TestParsePrototypeMarkFixture(t *testing.T) {
	for _, tt := range readPrototypeFixtures(t).Placements {
		t.Run(tt.Name, func(t *testing.T) {
			c, err := Parse(".doan/canvases/a.html", []byte(`<head></head><body>`+tt.HTML+`</body>`))
			if err != nil {
				t.Fatal(err)
			}
			type frame = struct {
				ID        string
				Prototype *string
			}
			got := []frame{}
			for _, f := range c.Frames {
				got = append(got, frame{f.ID, f.Prototype})
			}
			want := append([]frame{}, tt.Frames...)
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("frames %+v, want %+v", got, want)
			}
			wantStray := tt.Stray
			if wantStray == nil {
				wantStray = []string{}
			}
			if !reflect.DeepEqual(c.StrayPrototypes, wantStray) {
				t.Fatalf("stray %q, want %q", c.StrayPrototypes, wantStray)
			}
		})
	}
}

func TestPrototypeTarget(t *testing.T) {
	head := `<head><meta name="doan:canvas" content="c"><meta name="doan:width" content="800"></head><body>`
	astral200 := strings.Repeat("\U0001F98A", 100)       // 100 code points, 200 UTF-16 units
	astral201 := strings.Repeat("\U0001F98A", 100) + "a" // 101 code points, 201 UTF-16 units
	astralWide := strings.Repeat("\U0001F98A", 200)      // 200 code points, 400 UTF-16 units
	str := func(s string) *string { return &s }
	for _, tt := range []struct {
		name, body, id string
		want           PrototypeFrame
		refusal        PrototypeRefusal
	}{
		{name: "marked frame", body: `<div data-doan-frame="checkout" data-doan-title="Checkout" data-doan-prototype="390x844"></div>`, id: "checkout",
			want: PrototypeFrame{ID: "checkout", Title: str("Checkout"), Size: "390x844"}},
		{name: "marked frame without a title", body: `<div data-doan-frame="a" data-doan-prototype="1x1"></div>`, id: "a",
			want: PrototypeFrame{ID: "a", Size: "1x1"}},
		{name: "the frame asked for among others", body: `<div data-doan-frame="a"></div><div data-doan-frame="b" data-doan-prototype="500x500"></div>`, id: "b",
			want: PrototypeFrame{ID: "b", Size: "500x500"}},
		{name: "no frames", body: `<div></div>`, id: "a", refusal: PrototypeMissing},
		{name: "no frame by that id", body: `<div data-doan-frame="a" data-doan-prototype="390x844"></div>`, id: "b", refusal: PrototypeMissing},
		{name: "ids compare exactly", body: `<div data-doan-frame="Hero" data-doan-prototype="390x844"></div>`, id: "hero", refusal: PrototypeMissing},
		{name: "a non-frame element with the id", body: `<div data-doan-id="a" data-doan-prototype="390x844"></div>`, id: "a", refusal: PrototypeMissing},
		// Duplicates are refused even when one of them is marked: Doan could not tell which one to play.
		{name: "two unmarked frames share the id", body: `<div data-doan-frame="a"></div><div data-doan-frame="a"></div>`, id: "a", refusal: PrototypeShared},
		{name: "two frames share the id, one marked", body: `<div data-doan-frame="a" data-doan-prototype="390x844"></div><div data-doan-frame="a"></div>`, id: "a", refusal: PrototypeShared},
		// A frame inside <template> is not a frame (convention 14), including after a self-closing <template/>.
		{name: "only inside a template", body: `<template><div data-doan-frame="a" data-doan-prototype="390x844"></div></template>`, id: "a", refusal: PrototypeMissing},
		{name: "inside a template after a self-closing template", body: `<template/><div data-doan-frame="a" data-doan-prototype="390x844"></div></template>`, id: "a", refusal: PrototypeMissing},
		{name: "a template copy does not make it shared", body: `<template><div data-doan-frame="a"></div></template><div data-doan-frame="a" data-doan-prototype="390x844"></div>`, id: "a",
			want: PrototypeFrame{ID: "a", Size: "390x844"}},
		{name: "unmarked", body: `<div data-doan-frame="a"></div>`, id: "a", refusal: PrototypeNotMarked},
		{name: "empty mark", body: `<div data-doan-frame="a" data-doan-prototype=""></div>`, id: "a", refusal: PrototypeNotMarked},
		{name: "mark with a trailing space", body: `<div data-doan-frame="a" data-doan-prototype="390x844 "></div>`, id: "a", refusal: PrototypeNotMarked},
		{name: "uppercase X", body: `<div data-doan-frame="a" data-doan-prototype="390X844"></div>`, id: "a", refusal: PrototypeNotMarked},
		{name: "leading zero", body: `<div data-doan-frame="a" data-doan-prototype="0390x844"></div>`, id: "a", refusal: PrototypeNotMarked},
		// The app and the injected prototype script cap a frame id at 200 UTF-16 units, so a longer one cannot play.
		{name: "200 UTF-16 units", body: `<div data-doan-frame="` + astral200 + `" data-doan-prototype="390x844"></div>`, id: astral200,
			want: PrototypeFrame{ID: astral200, Size: "390x844"}},
		{name: "201 UTF-16 units", body: `<div data-doan-frame="` + astral201 + `" data-doan-prototype="390x844"></div>`, id: astral201, refusal: PrototypeTooLong},
		{name: "200 code points over 200 UTF-16 units", body: `<div data-doan-frame="` + astralWide + `" data-doan-prototype="390x844"></div>`, id: astralWide, refusal: PrototypeTooLong},
	} {
		t.Run(tt.name, func(t *testing.T) {
			for _, prefix := range []string{"", "\uFEFF"} {
				c, err := Parse(".doan/canvases/a.html", []byte(prefix+head+tt.body+`</body>`))
				if err != nil {
					t.Fatal(err)
				}
				got, refusal := PrototypeTarget(c, tt.id)
				if refusal != tt.refusal || !reflect.DeepEqual(got, tt.want) {
					t.Fatalf("BOM %v: %+v %v, want %+v %v", prefix != "", got, refusal, tt.want, tt.refusal)
				}
			}
		})
	}
}
