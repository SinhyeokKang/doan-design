package cli

import (
	"fmt"
	"strings"
	"testing"
)

func TestEscapeControl(t *testing.T) {
	for r := rune(0); r <= 0x9f; r++ {
		s := string(r)
		want := s
		if (r < 32 && r != '\n' && r != '\t') || r >= 127 {
			want = fmt.Sprintf("\\u%04X", r)
		}
		if got := EscapeControl(s); got != want {
			t.Errorf("%U: %q != %q", r, got, want)
		}
	}
	s := "한글\n\t\x1b[31m"
	if got := EscapeControl(s); got != strings.ReplaceAll(s, "\x1b", "\\u001B") {
		t.Fatal(got)
	}
}

func TestEscapeControlInvalidUTF8(t *testing.T) {
	if got := EscapeControl("\x9b"); got != "\ufffd" {
		t.Fatalf("got %q", got)
	}
}
