package comments

import (
	"os"
	"path/filepath"
	"testing"
)

func TestAppendPreservesBytesAndSeparatesLines(t *testing.T) {
	for _, initial := range []string{"", "first", "first\n"} {
		p := filepath.Join(t.TempDir(), "events")
		if e := os.WriteFile(p, []byte(initial), 0644); e != nil {
			t.Fatal(e)
		}
		if e := Append(p, []byte("second\nthird\n")); e != nil {
			t.Fatal(e)
		}
		b, e := os.ReadFile(p)
		if e != nil {
			t.Fatal(e)
		}
		want := initial
		if initial != "" && initial[len(initial)-1] != '\n' {
			want += "\n"
		}
		want += "second\nthird\n"
		if string(b) != want {
			t.Fatalf("%q != %q", b, want)
		}
	}
}
