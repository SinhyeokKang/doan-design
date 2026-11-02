package cli

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
)

var workCanvasPath = regexp.MustCompile(`^\.doan/(canvases|ds)/[^/]+\.html$`)

func workTarget(root, path string) (string, error) {
	if path == "" {
		return "", fmt.Errorf("expected a canvas path")
	}
	candidate := path
	if !filepath.IsAbs(candidate) {
		candidate = filepath.Join(root, candidate)
	} else {
		// Canonicalize only the root alias here so canvas-directory spelling
		// still passes the lexical check before any in-repo links are followed.
		for ancestor := filepath.Dir(candidate); ; ancestor = filepath.Dir(ancestor) {
			real, err := filepath.EvalSymlinks(ancestor)
			if err == nil && real == root {
				suffix, err := filepath.Rel(ancestor, candidate)
				if err != nil {
					return "", err
				}
				candidate = filepath.Join(root, suffix)
				break
			}
			if filepath.Dir(ancestor) == ancestor {
				break
			}
		}
	}
	relative, err := filepath.Rel(root, candidate)
	if err != nil {
		return "", err
	}
	if !workCanvasPath.MatchString(filepath.ToSlash(relative)) {
		return "", fmt.Errorf("expected .doan/canvases/*.html or .doan/ds/*.html: %s", path)
	}
	// Resolve the nearest existing ancestor before appending missing components;
	// a dangling symlink must not be mistaken for a not-yet-created canvas.
	ancestor := candidate
	missing := []string{}
	for {
		info, e := os.Lstat(ancestor)
		if e == nil {
			if len(missing) == 0 && info.IsDir() {
				return "", fmt.Errorf("canvas is a directory: %s", path)
			}
			break
		}
		if !os.IsNotExist(e) {
			return "", e
		}
		missing = append(missing, filepath.Base(ancestor))
		parent := filepath.Dir(ancestor)
		if parent == ancestor {
			return "", e
		}
		ancestor = parent
	}
	ancestorRel, err := filepath.Rel(root, ancestor)
	if err != nil {
		return "", err
	}
	state, resolved, err := repo.Resolve(root, root, ancestorRel)
	if err != nil {
		return "", err
	}
	if state != repo.Inside {
		return "", fmt.Errorf("canvas path cannot be resolved inside the repository: %s", path)
	}
	info, err := os.Stat(filepath.Join(root, resolved))
	if err != nil {
		return "", err
	}
	if (len(missing) > 0 && !info.IsDir()) || (len(missing) == 0 && !info.Mode().IsRegular()) {
		return "", fmt.Errorf("expected a regular canvas file or directory parent: %s", path)
	}
	for i := len(missing) - 1; i >= 0; i-- {
		resolved = filepath.Join(resolved, missing[i])
	}
	resolved = filepath.ToSlash(resolved)
	if !workCanvasPath.MatchString(resolved) {
		return "", fmt.Errorf("resolved path is outside the canvas directories: %s", path)
	}
	return resolved, nil
}

func workSession(claude, thread, legacy string) (provider, id string) {
	if (claude != "" && (thread != "" || legacy != "")) || (thread != "" && legacy != "" && thread != legacy) {
		return "", ""
	}
	provider, id = "claude", claude
	if id == "" {
		provider, id = "codex", thread
		if id == "" {
			id = legacy
		}
	}
	if id == "" || strings.HasPrefix(id, "-") || strings.ContainsRune(id, 0) {
		return "", ""
	}
	return provider, id
}

func readWorkResponse(line []byte) bool {
	var value any
	if json.Unmarshal(line, &value) != nil || formats.ValidateWorkResponse(value) != nil {
		return false
	}
	return value.(map[string]any)["ok"] == true
}

func canvasLink(root, path string) string {
	encode := func(value string) string { return strings.ReplaceAll(url.QueryEscape(value), "+", "%20") }
	return "doan://open?root=" + encode(root) + "&canvas=" + encode(path)
}
