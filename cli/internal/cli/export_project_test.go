package cli

import (
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
)

func TestExportProjectName(t *testing.T) {
	for _, c := range []struct {
		git  *repo.GitInfo
		want string
	}{
		{&repo.GitInfo{Main: "/projects/store"}, "store"},
		{&repo.GitInfo{}, "checkout"},
		{nil, "checkout"},
	} {
		if got := exportProjectName("/work/checkout", c.git); got != c.want {
			t.Errorf("project name with git %v = %q, want %q", c.git, got, c.want)
		}
	}
}
