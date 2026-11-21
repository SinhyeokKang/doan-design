package export

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestProjectThumb(t *testing.T) {
	data, err := os.ReadFile("../../../schema/fixtures/project-thumb/cases.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct{ Name, Hue, Initial string }
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		if h, i := projectHue(c.Name), projectInitial(c.Name); h != c.Hue || i != c.Initial {
			t.Errorf("thumbnail(%q) = (%q, %q), want (%q, %q)", c.Name, h, i, c.Hue, c.Initial)
		}
	}
}

func TestAssembleEscapesProject(t *testing.T) {
	page, err := Assemble(Meta{Project: "<&{{NAME}}", Name: "board", Width: 100}, noFrames, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{">&lt;<", ">&lt;&amp;{{NAME}}</span>"} {
		if !strings.Contains(string(page), want) {
			t.Errorf("missing %q", want)
		}
	}
}
