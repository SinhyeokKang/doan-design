package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
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
		ops.TokenCSS, failure = configPath(r.Root, f.TokenCSS, true)
		if failure != nil {
			return Outcome{}, failure
		}
	}

	for _, path := range f.AddServe {
		p, failure := configPath(r.Root, path, false)
		if failure != nil {
			return Outcome{}, failure
		}
		ops.AddServe = append(ops.AddServe, p)
	}
	if len(f.RemoveServe) > 0 {
		inputRoot := f.Repo
		if inputRoot == "" {
			inputRoot = ctx.Start
		} else if !filepath.IsAbs(inputRoot) {
			inputRoot = filepath.Join(ctx.Start, inputRoot)
		}
		for {
			state, relative, err := repo.InsideRelative(r.Root, inputRoot)
			if err != nil {
				return Outcome{}, internal(err)
			}
			if state == repo.Inside && relative == "." {
				break
			}
			parent := filepath.Dir(inputRoot)
			if parent == inputRoot {
				return Outcome{}, usageError("Repository root spelling could not be resolved")
			}
			inputRoot = parent
		}
		for _, path := range f.RemoveServe {
			paths, failure := configRemovalPaths(r.Root, inputRoot, path, r.Config.Serve)
			if failure != nil {
				return Outcome{}, failure
			}
			ops.RemoveServe = append(ops.RemoveServe, paths...)
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

func configPath(root, path string, token bool) (string, *Error) {
	if path == "" {
		return "", usageError("Config paths must not be empty")
	}
	if !filepath.IsAbs(path) {
		path = filepath.Join(root, path)
	}
	state, relative, err := repo.InsideRelative(root, path)
	if err != nil {
		return "", internal(err)
	}
	if state == repo.Missing {
		return "", usageError("Config path does not exist")
	}
	if state == repo.Outside {
		return "", usageError("Config path is outside the repository")
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
		if relative == "." || relative == ".doan" || strings.HasPrefix(relative, ".doan/") || relative == ".git" || strings.HasPrefix(relative, ".git/") {
			return "", usageError("Serve paths must not be the repository root, .git or inside .git/ or .doan/")
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

// Removal compares stored identities even after a build deletes their targets.
func configRemovalPaths(root, inputRoot, path string, stored []string) ([]string, *Error) {
	if path == "" {
		return nil, usageError("Config paths must not be empty")
	}
	if !filepath.IsAbs(path) {
		path = filepath.Join(root, path)
	}
	relative := ""
	for _, base := range []string{root, inputRoot} {
		rel, err := filepath.Rel(base, path)
		if err != nil {
			return nil, internal(err)
		}
		if rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			relative = filepath.ToSlash(rel)
			break
		}
	}
	state, canonical, err := repo.InsideRelative(root, path)
	if err != nil {
		return nil, internal(err)
	}
	if state == repo.Outside || (state == repo.Missing && relative == "") {
		return nil, usageError("Config path is outside the repository")
	}
	paths := []string{}
	if relative != "" {
		paths = append(paths, relative)
	}
	if state == repo.Inside {
		paths = append(paths, canonical)
	}
	for _, value := range stored {
		cleaned := filepath.ToSlash(filepath.Clean(value))
		if slices.Contains(paths, cleaned) {
			paths = append(paths, value)
			continue
		}
		if state == repo.Inside {
			storedState, storedPath, err := repo.InsideRelative(root, filepath.Join(root, value))
			if err != nil {
				return nil, internal(err)
			}
			if storedState == repo.Inside && storedPath == canonical {
				paths = append(paths, value)
			}
		}
	}
	return paths, nil
}
