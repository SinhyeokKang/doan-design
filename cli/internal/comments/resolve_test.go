package comments_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/SinhyeokKang/doan-design/cli/internal/comments"
	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
)

func TestMaxAt(t *testing.T) {
	for _, tc := range []struct{ name, want string }{
		{"union-merge", "2026-10-21T10:03:00.000Z"},
		{"shuffled-lines", "2026-10-21T10:00:04.000Z"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			data, err := os.ReadFile("../../../schema/fixtures/fold/" + tc.name + "/events.jsonl")
			if err != nil {
				t.Fatal(err)
			}
			parsed := formats.ParseLines(string(data))
			if len(parsed.Warnings) != 0 {
				t.Fatalf("warnings: %+v", parsed.Warnings)
			}
			at, ok := comments.MaxAt(parsed)
			if !ok || at != tc.want {
				t.Fatalf("MaxAt = %q, %v; want %q, true", at, ok, tc.want)
			}
			// Moving the last line first makes both fixtures guard against last-line selection.
			lines := strings.Split(strings.TrimSuffix(string(data), "\n"), "\n")
			shuffled := append([]string{lines[len(lines)-1]}, lines[:len(lines)-1]...)
			at, ok = comments.MaxAt(formats.ParseLines(strings.Join(shuffled, "\n")))
			if !ok || at != tc.want {
				t.Fatalf("reordered MaxAt = %q, %v", at, ok)
			}
		})
	}
	for _, input := range []string{"", `{"v":1,"at":"2099-01-01T00:00:00.000Z"}`} {
		at, ok := comments.MaxAt(formats.ParseLines(input))
		if ok || at != "" {
			t.Fatalf("empty/invalid MaxAt = %q, %v", at, ok)
		}
	}
	valid := `{"v":1,"id":"evt_00000000-0000-4000-8000-000000000001","at":"2026-10-21T10:00:00.000Z","type":"resolve","comment":"cmt_00000000-0000-4000-8000-000000000001","by":{"kind":"agent","name":"codex"}}`
	parsed := formats.ParseLines(valid + "\n" + `{"v":1,"at":"2099-01-01T00:00:00.000Z"}` + "\n" + strings.Replace(valid, `"v":1`, `"v":2`, 1))
	if len(parsed.Warnings) != 2 {
		t.Fatalf("warnings: %+v", parsed.Warnings)
	}
	at, ok := comments.MaxAt(parsed)
	if !ok || at != "2026-10-21T10:00:00.000Z" {
		t.Fatalf("MaxAt with rejected events = %q, %v", at, ok)
	}
}

func TestNextAt(t *testing.T) {
	for _, tc := range []struct {
		name, max string
		ok        bool
		now, want string
	}{
		{"empty log", "ignored", false, "2026-10-21T10:00:00.123999Z", "2026-10-21T10:00:00.123Z"},
		{"future maximum", "2026-10-21T11:00:00.000Z", true, "2026-10-21T10:00:00Z", "2026-10-21T11:00:00.001Z"},
		{"equal maximum", "2026-10-21T10:00:00.123Z", true, "2026-10-21T10:00:00.123999Z", "2026-10-21T10:00:00.124Z"},
		{"past maximum", "2026-10-21T09:00:00.000Z", true, "2026-10-21T10:00:00.999999Z", "2026-10-21T10:00:00.999Z"},
		{"day rollover", "2026-10-21T23:59:59.999Z", true, "2026-10-21T10:00:00Z", "2026-10-22T00:00:00.000Z"},
		{"year rollover", "2026-12-31T23:59:59.999Z", true, "2026-10-21T10:00:00Z", "2027-01-01T00:00:00.000Z"},
		{"UTC conversion", "", false, "2026-10-21T01:00:00.123999+09:00", "2026-10-20T16:00:00.123Z"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			now, err := time.Parse(time.RFC3339Nano, tc.now)
			if err != nil {
				t.Fatal(err)
			}
			at, err := comments.NextAt(tc.max, tc.ok, now)
			if err != nil || at != tc.want {
				t.Fatalf("NextAt = %q, %v; want %q", at, err, tc.want)
			}
		})
	}
	t.Run("invalid maximum", func(t *testing.T) {
		at, err := comments.NextAt("invalid", true, time.Time{})
		if err == nil || at != "" {
			t.Fatalf("NextAt = %q, %v; want error", at, err)
		}
	})
	t.Run("successive events", func(t *testing.T) {
		now := time.Date(2026, 10, 21, 10, 0, 0, 0, time.UTC)
		at, err := comments.NextAt("", false, now)
		if err != nil {
			t.Fatal(err)
		}
		at, err = comments.NextAt(at, true, now)
		if err != nil || at != "2026-10-21T10:00:00.001Z" {
			t.Fatalf("NextAt = %q, %v", at, err)
		}
	})
}

func TestNewResolve(t *testing.T) {
	const comment = "cmt_00000000-0000-4000-8000-000000000001"
	const at = "2026-10-21T10:00:00.123Z"
	for _, tc := range []struct {
		name string
		data []byte
		id   string
	}{
		{"zero bits", bytes.Repeat([]byte{0}, 16), "evt_00000000-0000-4000-8000-000000000000"},
		{"one bits", bytes.Repeat([]byte{255}, 16), "evt_ffffffff-ffff-4fff-bfff-ffffffffffff"},
		{"preserved random bits", []byte{0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15}, "evt_00010203-0405-4607-8809-0a0b0c0d0e0f"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			event, err := comments.NewResolve(comment, "codex", at, bytes.NewReader(tc.data))
			if err != nil {
				t.Fatal(err)
			}
			data, err := json.Marshal(event)
			if err != nil {
				t.Fatal(err)
			}
			var value any
			if err := json.Unmarshal(data, &value); err != nil {
				t.Fatal(err)
			}
			if err := formats.ValidateCommentEvent(value); err != nil {
				t.Fatal(err)
			}
			expected := map[string]any{"v": float64(1), "id": tc.id, "at": at, "type": "resolve", "comment": comment, "by": map[string]any{"kind": "agent", "name": "codex"}}
			if !reflect.DeepEqual(value, expected) {
				t.Fatalf("event = %s; want %+v", data, expected)
			}
		})
	}
	for _, n := range []int{0, 15} {
		event, err := comments.NewResolve(comment, "codex", at, bytes.NewReader(make([]byte, n)))
		want := io.EOF
		if n > 0 {
			want = io.ErrUnexpectedEOF
		}
		if !errors.Is(err, want) || event != (formats.CommentEvent{}) {
			t.Fatalf("short read = %+v, %v; want zero event, %v", event, err, want)
		}
	}
	sentinel := errors.New("random source failed")
	event, err := comments.NewResolve(comment, "codex", at, failingReader{sentinel})
	if !errors.Is(err, sentinel) || event != (formats.CommentEvent{}) {
		t.Fatalf("read failure = %+v, %v", event, err)
	}
}

type failingReader struct{ err error }

func (r failingReader) Read([]byte) (int, error) { return 0, r.err }
