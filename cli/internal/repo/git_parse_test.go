package repo

import (
	"fmt"
	"reflect"
	"strings"
	"testing"
)

func TestParseGitFile(t *testing.T) {
	for _, tt := range []struct{ name, text, want string }{
		{"absolute", "gitdir: /repos/main/.git/worktrees/topic\n", "/repos/main/.git/worktrees/topic"},
		{"relative", "gitdir: ../main/.git/worktrees/topic\r\n", "../main/.git/worktrees/topic"},
		{"spaces", "gitdir: /repos/my project/.git\n", "/repos/my project/.git"},
		{"empty", "", ""}, {"no path", "gitdir: \n", ""},
		{"wrong prefix", "path: /repo/.git", ""},
		{"multiple lines", "gitdir: /one\ngitdir: /two\n", ""},
		{"nul", "gitdir: /repo/\x00.git", ""},
		{"limit", "gitdir: " + strings.Repeat("a", 4088), strings.Repeat("a", 4088)},
		{"oversized", "gitdir: " + strings.Repeat("a", 4089), ""},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if got := parseGitFile(tt.text); got != tt.want {
				t.Fatalf("got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestParseHead(t *testing.T) {
	for _, tt := range []struct{ name, text, branch, detached string }{
		{"branch", "ref: refs/heads/feature/home\r\n", "feature/home", ""},
		{"sha1", strings.Repeat("a1", 20) + "\n", "", strings.Repeat("a1", 20)},
		{"sha256", strings.Repeat("AF", 32), "", strings.Repeat("AF", 32)},
		{"other ref", "ref: refs/tags/v1\n", "", ""},
		{"placeholder", "ref: refs/heads/.invalid\n", "", ""},
		{"reftable", "ref: refs/heads/.invalid", "", ""},
		{"empty branch", "ref: refs/heads/", "", ""},
		{"empty", "", "", ""}, {"short sha", "abcdef", "", ""},
		{"non hex", strings.Repeat("g", 40), "", ""},
		{"multiple lines", "ref: refs/heads/main\nextra", "", ""},
		{"oversized", "ref: refs/heads/" + strings.Repeat("a", 4096), "", ""},
	} {
		t.Run(tt.name, func(t *testing.T) {
			b, d := parseHead(tt.text)
			if b != tt.branch || d != tt.detached {
				t.Fatalf("got (%q,%q), want (%q,%q)", b, d, tt.branch, tt.detached)
			}
		})
	}
}

func TestParseCommondir(t *testing.T) {
	for _, tt := range []struct{ name, text, base, want string }{
		{"linked", "../..\r\n", "/repo/.git/worktrees/topic", "/repo/.git"},
		{"absolute", "/repo/.git\n", "/elsewhere", "/repo/.git"},
		{"empty is invalid not absent", "", "/repo/.git/modules/sub", ""},
		{"multiple lines", "../..\n/other", "/repo/.git", ""},
		{"nul", "/bad\x00", "/repo/.git", ""},
		{"relative base", "..", "relative", ""},
		{"oversized", strings.Repeat("a", 4097), "/repo/.git", ""},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if got := parseCommondir(tt.text, tt.base); got != tt.want {
				t.Fatalf("got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestIsMainWorktree(t *testing.T) {
	for _, tt := range []struct {
		name, common string
		same, want   bool
	}{
		{"directory git", "/repo/.git", true, true},
		{"bare", "/repo.git", true, false},
		{"submodule without commondir", "/repo/.git/modules/sub", false, false},
		{"separate git dir", "/metadata/.git", false, false},
		{"unverified directory", "/repo/.git", false, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if got := isMainWorktree(tt.common, tt.same); got != tt.want {
				t.Fatalf("got %v", got)
			}
		})
	}
}

func TestWorktreeGitdirs(t *testing.T) {
	entries := []worktreeGitdirEntry{
		{"/repo/.git/worktrees/a", "/trees/z/.git\r\n"},
		{"/repo/.git/worktrees/b", "../../../../trees/a/.git\n"},
		{"/repo/.git/worktrees/c", "/trees/a/./.git"},
		{"/repo/.git/worktrees/d", "gitdir: /trees/b/.git"},
		{"/repo/.git/worktrees/e", "\n"},
		{"/repo/.git/worktrees/f", "/trees/b/.git\n/trees/c/.git"},
		{"/repo/.git/worktrees/g", strings.Repeat("a", 4097)},
	}
	if got := worktreeGitdirs(entries); !reflect.DeepEqual(got, []string{"/trees/a/.git", "/trees/z/.git"}) {
		t.Fatalf("got %q", got)
	}
	entries = nil
	for i := 0; i < 201; i++ {
		entries = append(entries, worktreeGitdirEntry{"/repo/.git/worktrees/x", fmt.Sprintf("/trees/%03d/.git", i)})
	}
	got := worktreeGitdirs(entries)
	if len(got) != 200 || got[199] != "/trees/199/.git" {
		t.Fatalf("limit: %d entries", len(got))
	}
}

func TestMapWorktrees(t *testing.T) {
	for _, tt := range []struct {
		name, rel string
		want      []string
	}{
		{"monorepo", "apps/doan", []string{"/trees/a/apps/doan", "/trees/z/apps/doan"}},
		{"root", ".", []string{"/trees/a", "/trees/z"}},
		{"empty rel", "", []string{"/trees/a", "/trees/z"}},
		{"escape", "../outside", []string{}},
		{"absolute", "/outside", []string{}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			trees := []string{"/trees/z", "/trees/a", "/trees/a/.", "relative"}
			before := append([]string{}, trees...)
			got := mapWorktrees(trees, tt.rel)
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("got %q, want %q", got, tt.want)
			}
			if !reflect.DeepEqual(trees, before) {
				t.Fatal("mutated input")
			}
		})
	}
}

func TestIgnoreAtOrAboveHome(t *testing.T) {
	for _, tt := range []struct {
		dir, home string
		want      bool
	}{
		{"/Users/me", "/Users/me", true}, {"/Users", "/Users/me", true}, {"/", "/Users/me", true},
		{"/Users/me/code", "/Users/me", false}, {"/Users/mes", "/Users/me", false},
		{"/Users/me", "/Users/mes", false}, {"/elsewhere", "/Users/me", false},
		{"/Users/me/.", "/Users/me", true}, {"/repo", "", false},
	} {
		if got := ignoreAtOrAboveHome(tt.dir, tt.home); got != tt.want {
			t.Errorf("(%q,%q): got %v", tt.dir, tt.home, got)
		}
	}
}
