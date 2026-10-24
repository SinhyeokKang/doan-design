package cli

import (
	"path/filepath"
	"slices"

	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
)

type configOps struct {
	TokenCSS                   string
	TokenCSSSet, ClearTokenCSS bool
	AddServe, RemoveServe      []string
}

func applyConfigOps(config repo.Config, ops configOps) (repo.Config, bool, *Error) {
	if ops.TokenCSSSet && ops.ClearTokenCSS {
		return config, false, usageError("--token-css and --clear-token-css cannot be combined")
	}
	next := config
	next.Serve = slices.Clone(config.Serve)
	if ops.TokenCSSSet {
		next.TokenCSS = ops.TokenCSS
	}
	if ops.ClearTokenCSS {
		next.TokenCSS = ""
	}
	for _, path := range ops.AddServe {
		if !slices.Contains(next.Serve, path) {
			next.Serve = append(next.Serve, path)
		}
	}
	next.Serve = slices.DeleteFunc(next.Serve, func(path string) bool {
		return slices.Contains(ops.RemoveServe, path) || slices.Contains(ops.RemoveServe, filepath.ToSlash(filepath.Clean(path)))
	})
	return next, next.TokenCSS != config.TokenCSS || !slices.Equal(next.Serve, config.Serve), nil
}
