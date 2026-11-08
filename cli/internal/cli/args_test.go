package cli

import (
	"bytes"
	"errors"
	"flag"
	"reflect"
	"testing"
)

func TestSplitArgs(t *testing.T) {
	for _, tt := range []struct {
		name       string
		args, want []string
		x          string
		json       bool
		fail       bool
	}{
		{"before command", []string{"--json", "ls"}, []string{"ls"}, "", true, false},
		{"interspersed", []string{"work", "--x", "foo", "update", "--json", "a.html"}, []string{"work", "update", "a.html"}, "foo", true, false},
		{"after", []string{"ls", "--x=foo", "-json"}, []string{"ls"}, "foo", true, false},
		{"last wins", []string{"--x=a", "ls", "--x", "b"}, []string{"ls"}, "b", false, false},
		{"terminator", []string{"ls", "--", "--json", "--x"}, []string{"ls", "--json", "--x"}, "", false, false},
		{"terminator first", []string{"--", "--json"}, []string{"--json"}, "", false, false},
		{"terminator after flag", []string{"--x=x", "--", "--json"}, []string{"--json"}, "x", false, false},
		{"missing value", []string{"--json", "ls", "--x"}, nil, "", true, true},
		{"unknown before json", []string{"ls", "--unknown", "--json"}, nil, "", true, true},
		{"empty", []string{}, []string{}, "", false, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			fs := flag.NewFlagSet("test", flag.ContinueOnError)
			var output bytes.Buffer
			fs.SetOutput(&output)
			j := fs.Bool("json", false, "")
			c := fs.String("x", "", "")
			got, err := SplitArgs(tt.args, fs)
			if tt.fail {
				var e *Error
				if !errors.As(err, &e) || e.Code != "usage_error" {
					t.Fatalf("error = %v", err)
				}
			} else if err != nil || !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("got %v, %v; want %v", got, err, tt.want)
			}
			if *j != tt.json || *c != tt.x {
				t.Fatalf("flags = %v, %q", *j, *c)
			}
			if output.Len() != 0 {
				t.Fatalf("flag output = %q", output.String())
			}
		})
	}
}

func TestSplitArgsHelp(t *testing.T) {
	for _, arg := range []string{"-h", "--help"} {
		_, err := SplitArgs([]string{"ls", arg}, flag.NewFlagSet("test", flag.ContinueOnError))
		if !errors.Is(err, flag.ErrHelp) {
			t.Fatal(err)
		}
	}
}
