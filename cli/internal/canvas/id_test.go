package canvas

import "testing"

func TestValidIDNeedsOneWellFormedID(t *testing.T) {
	for name, c := range map[string]struct {
		canvas Canvas
		want   bool
	}{
		"valid":     {Canvas{HasID: true, ID: "home-2"}, true},
		"absent":    {Canvas{}, false},
		"no meta":   {Canvas{ID: "home"}, false},
		"empty":     {Canvas{HasID: true}, false},
		"duplicate": {Canvas{HasID: true, IDDup: true, ID: "home"}, false},
		"malformed": {Canvas{HasID: true, ID: " Home"}, false},
	} {
		if got := c.canvas.ValidID(); got != c.want {
			t.Errorf("%s: ValidID() = %v, want %v", name, got, c.want)
		}
	}
}
