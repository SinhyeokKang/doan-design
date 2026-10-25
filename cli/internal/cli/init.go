package cli

import (
	"bytes"
	"encoding/json"
	"fmt"
	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func Init(ctx Context, f Flags, args []string) (Outcome, *Error) {
	if len(args) != 0 {
		return Outcome{}, usageError("init takes no positional arguments")
	}
	root := ctx.Start
	if f.Repo != "" {
		root = f.Repo
		if !filepath.IsAbs(root) {
			root = filepath.Join(ctx.Start, root)
		}
	}
	root, e := filepath.Abs(root)
	if e != nil {
		return Outcome{}, internal(e)
	}
	root, e = filepath.EvalSymlinks(root)
	if e != nil {
		if repo.IsMissingPath(e) {
			return Outcome{}, usageError("Repository directory does not exist or cannot be resolved")
		}
		return Outcome{}, internal(e)
	}
	st, e := os.Stat(root)
	if e != nil {
		if repo.IsMissingPath(e) {
			return Outcome{}, usageError("Repository directory does not exist or cannot be resolved")
		}
		return Outcome{}, internal(e)
	}
	if !st.IsDir() {
		return Outcome{}, usageError("Repository path must be a directory")
	}
	if info, err := os.Stat(filepath.Join(root, ".doan")); err == nil && info.Mode().IsRegular() {
		return Outcome{}, &Error{Code: "usage_error", Message: ".doan must be a directory", NextSteps: []string{"Remove or rename .doan before running `doan init`"}}
	} else if err != nil && !os.IsNotExist(err) {
		return Outcome{}, internal(err)
	}
	result := map[string]any{"initialized": false, "repo": root, "created": []string{}}
	configPath := filepath.Join(root, ".doan/config.json")
	st, e = os.Stat(configPath)
	if e == nil {
		if !st.Mode().IsRegular() {
			return Outcome{}, &Error{Code: "invalid_config", Message: "Config is not a regular file"}
		}
		b, e := os.ReadFile(configPath)
		if e != nil {
			return Outcome{}, internal(e)
		}
		c, code := repo.ParseConfig(b)
		if code != "" {
			return Outcome{}, &Error{Code: code, Message: "Cannot read config: " + configPath}
		}
		if c.TokenCSS != "" {
			result["tokenCss"] = c.TokenCSS
		}
		return Outcome{Result: result}, nil
	}
	if !os.IsNotExist(e) {
		return Outcome{}, internal(e)
	}
	if info, err := os.Stat(filepath.Join(root, ".gitattributes")); err == nil && info.IsDir() {
		return Outcome{}, &Error{Code: "usage_error", Message: ".gitattributes must be a regular file", NextSteps: []string{"Remove or rename .gitattributes before running `doan init`"}}
	} else if err != nil && !os.IsNotExist(err) {
		return Outcome{}, internal(err)
	}
	token := f.TokenCSS
	if !f.TokenCSSSet && token == "" && ctx.Terminal && !f.JSON {
		if ctx.Prompt == nil {
			return Outcome{}, internal(fmt.Errorf("missing prompt function"))
		}
		token, e = ctx.Prompt("Token CSS path (empty for none):")
		if e != nil {
			return Outcome{}, internal(e)
		}
	}
	config := repo.Config{V: 1}
	if token != "" || f.TokenCSSSet {
		if filepath.IsAbs(token) {
			state, relative, err := repo.InsideRelative(root, token)
			if err != nil {
				return Outcome{}, internal(err)
			}
			if state != repo.Inside {
				return Outcome{}, usageError("Token CSS must be a file inside the repository")
			}
			token = relative
		}
		config.TokenCSS = filepath.ToSlash(filepath.Clean(token))
		b, e := json.Marshal(config)
		if e != nil {
			return Outcome{}, internal(e)
		}
		_, code := repo.ParseConfig(b)
		state, p, e := repo.Resolve(root, root, token)
		if e != nil {
			return Outcome{}, internal(e)
		}
		if code != "" || token == "" || state != repo.Inside {
			return Outcome{}, usageError("Token CSS must be a file inside the repository")
		}
		st, e := os.Stat(filepath.Join(root, p))
		if e != nil {
			return Outcome{}, internal(e)
		}
		if !st.Mode().IsRegular() {
			return Outcome{}, usageError("Token CSS must be a regular file")
		}
		config.TokenCSS = p
		result["tokenCss"] = config.TokenCSS
	}
	// Initialization must not follow output paths into a different repository.
	for _, p := range []string{"design", ".doan", ".doan/config.json", ".gitattributes"} {
		state, _, e := repo.Resolve(root, root, p)
		if e != nil {
			return Outcome{}, internal(e)
		}
		// A dangling link is missing to readers, but a write can create its outside target.
		if state == repo.Missing {
			info, err := os.Lstat(filepath.Join(root, p))
			if err != nil && !os.IsNotExist(err) {
				return Outcome{}, internal(err)
			}
			if err == nil && info.Mode()&os.ModeSymlink != 0 {
				return Outcome{}, usageError("Initialization path is a dangling symlink: " + p)
			}
		}
		if state == repo.Outside {
			return Outcome{}, usageError("Initialization path leaves repository: " + p)
		}
	}
	attrsPath := filepath.Join(root, ".gitattributes")
	attrs, e := os.ReadFile(attrsPath)
	if e != nil && !os.IsNotExist(e) {
		return Outcome{}, internal(e)
	}
	line := ".doan/comments/*.jsonl merge=union"
	has := false
	for _, s := range strings.Split(string(attrs), "\n") {
		if strings.TrimSuffix(s, "\r") == line {
			has = true
		}
	}
	created := []string{}
	if _, e := os.Stat(filepath.Join(root, "design")); os.IsNotExist(e) {
		created = append(created, "design/")
	} else if e != nil {
		return Outcome{}, internal(e)
	}
	if e := os.MkdirAll(filepath.Join(root, "design"), 0755); e != nil {
		return Outcome{}, internal(e)
	}
	if e := os.MkdirAll(filepath.Join(root, ".doan"), 0755); e != nil {
		return Outcome{}, internal(e)
	}
	b, e := json.MarshalIndent(config, "", "  ")
	if e != nil {
		return Outcome{}, internal(e)
	}
	// A discoverable config marks initialization complete, including merge setup.
	staged, e := os.CreateTemp(filepath.Dir(configPath), ".config-*")
	if e != nil {
		return Outcome{}, internal(e)
	}
	defer os.Remove(staged.Name())
	if e := staged.Chmod(0644); e != nil {
		staged.Close()
		return Outcome{}, internal(e)
	}
	if _, e := staged.Write(append(b, '\n')); e != nil {
		staged.Close()
		return Outcome{}, internal(e)
	}
	if e := staged.Close(); e != nil {
		return Outcome{}, internal(e)
	}
	if !has {
		newline := "\n"
		if bytes.Contains(attrs, []byte("\r\n")) {
			newline = "\r\n"
		}
		if len(attrs) > 0 && attrs[len(attrs)-1] != '\n' {
			attrs = append(attrs, newline...)
		}
		attrs = append(attrs, line+newline...)
		if e := os.WriteFile(attrsPath, attrs, 0644); e != nil {
			return Outcome{}, internal(e)
		}
		created = append(created, ".gitattributes")
	}
	// Publish exclusively so a concurrent initializer's config is not overwritten.
	if e := os.Link(staged.Name(), configPath); e != nil {
		return Outcome{}, internal(e)
	}
	created = append(created, ".doan/config.json")
	sort.Strings(created)
	result["initialized"] = true
	result["created"] = created
	return Outcome{Result: result}, nil
}
