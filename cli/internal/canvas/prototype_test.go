package canvas

import (
	"encoding/json"
	"os"
	"reflect"
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
