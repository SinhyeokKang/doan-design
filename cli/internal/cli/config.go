package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
)

func Config(ctx Context, f Flags, args []string) (Outcome, *Error) {
	if len(args) != 0 {
		return Outcome{}, usageError("config takes no positional arguments")
	}
	if f.TokenCSSSet && f.ClearTokenCSS {
		return Outcome{}, usageError("--token-css and --clear-token-css cannot be combined")
	}
	r, failure := repository(ctx, f)
	if failure != nil {
		return Outcome{}, failure
	}
	ops := configOps{TokenCSSSet: f.TokenCSSSet, ClearTokenCSS: f.ClearTokenCSS}
	if f.TokenCSSSet {
		ops.TokenCSS, failure = configPath(r.Root, ctx.Start, f.TokenCSS, true)
		if failure != nil {
			return Outcome{}, failure
		}
	}
	for _, group := range []struct {
		paths  []string
		target *[]string
	}{{f.AddServe, &ops.AddServe}, {f.RemoveServe, &ops.RemoveServe}} {
		for _, path := range group.paths {
			p, failure := configPath(r.Root, ctx.Start, path, false)
			if failure != nil {
				return Outcome{}, failure
			}
			*group.target = append(*group.target, p)
		}
	}
	next, changed, failure := applyConfigOps(r.Config, ops)
	if failure != nil {
		return Outcome{}, failure
	}
	if changed {
		data, err := json.MarshalIndent(next, "", "  ")
		if err != nil {
			return Outcome{}, internal(err)
		}
		if _, code := repo.ParseConfig(data); code != "" {
			return Outcome{}, usageError("Config paths must satisfy the config schema")
		}
		// Resolve the output too: a linked .doan must never redirect writes outside the repo.
		state, relative, err := repo.Resolve(r.Root, r.Root, ".doan/config.json")
		if err != nil {
			return Outcome{}, internal(err)
		}
		if state != repo.Inside {
			return Outcome{}, usageError("Config path must be inside the repository")
		}
		path := filepath.Join(r.Root, relative)
		if err := writeConfig(path, append(data, '\n')); err != nil {
			return Outcome{}, internal(err)
		}
	}
	serve := append([]string{}, next.Serve...)
	result := map[string]any{"repo": r.Root, "serve": serve, "changed": changed}
	if next.TokenCSS != "" {
		result["tokenCss"] = next.TokenCSS
	}
	return Outcome{Result: result}, nil
}

func configPath(root, start, path string, token bool) (string, *Error) {
	if path == "" {
		return "", usageError("Config paths must not be empty")
	}
	if !filepath.IsAbs(path) {
		path = filepath.Join(start, path)
	}
	state, relative, err := repo.InsideRelative(root, path)
	if err != nil {
		return "", internal(err)
	}
	if state != repo.Inside {
		return "", usageError("Config paths must exist inside the repository")
	}
	info, err := os.Stat(filepath.Join(root, relative))
	if err != nil {
		return "", internal(err)
	}
	if token {
		if !info.Mode().IsRegular() {
			return "", usageError("Token CSS must be a regular file")
		}
	} else {
		if relative == "." || relative == ".doan" || strings.HasPrefix(relative, ".doan/") {
			return "", usageError("Serve paths must not be the repository root or inside .doan")
		}
		if !info.Mode().IsRegular() && !info.IsDir() {
			return "", usageError("Serve paths must be regular files or directories")
		}
	}
	return relative, nil
}

func writeConfig(path string, data []byte) error {
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	temp, err := os.CreateTemp(filepath.Dir(path), ".config-*")
	if err != nil {
		return err
	}
	name := temp.Name()
	defer os.Remove(name)
	if err := temp.Chmod(info.Mode().Perm()); err != nil {
		temp.Close()
		return err
	}
	if _, err := temp.Write(data); err != nil {
		temp.Close()
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	return os.Rename(name, path)
}
