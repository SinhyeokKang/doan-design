package cli

import (
	"encoding/json"
	"path/filepath"
)

// argv turns MCP tool arguments into the argv cli.Run takes, so a tool call and
// the matching `doan <command> --json` share every parsing and lookup rule.
// Values go in as --name=value and ids after --, so a leading "-" is never read as a flag.
func argv(tool string, raw json.RawMessage) ([]string, *Error) {
	fields := map[string]json.RawMessage{}
	if len(raw) > 0 {
		if e := json.Unmarshal(raw, &fields); e != nil {
			return nil, usageError("Tool " + tool + " arguments must be an object")
		}
	}
	allowed := map[string][]string{
		"init":             {"repo", "tokenCss"},
		"ls":               {"repo"},
		"comments":         {"repo", "canvas"},
		"resolve_comments": {"repo", "ids", "agent"},
		"check":            {"repo"},
		"skill":            {},
	}[tool]
	for key := range fields {
		known := false
		for _, a := range allowed {
			known = known || a == key
		}
		if !known {
			return nil, usageError("Tool " + tool + " does not accept argument " + key)
		}
	}
	str := func(key string) (string, bool, *Error) {
		v, ok := fields[key]
		if !ok {
			return "", false, nil
		}
		var s *string
		if json.Unmarshal(v, &s) != nil || s == nil {
			return "", false, usageError("Argument " + key + " must be a string")
		}
		return *s, true, nil
	}
	out := []string{tool}
	if tool == "resolve_comments" {
		out = []string{"comment", "resolve"}
	}
	repo, ok, e := str("repo")
	if e != nil {
		return nil, e
	}
	if ok {
		// The server's working directory is fixed for the session and invisible to
		// the agent, so a relative path could silently target another directory.
		if !filepath.IsAbs(repo) {
			return nil, usageError("Argument repo must be an absolute path")
		}
		out = append(out, "--repo="+repo)
	}
	for _, f := range [][2]string{{"tokenCss", "token-css"}, {"canvas", "canvas"}, {"agent", "agent"}} {
		v, ok, e := str(f[0])
		if e != nil {
			return nil, e
		}
		if ok {
			out = append(out, "--"+f[1]+"="+v)
		}
	}
	out = append(out, "--json")
	if tool == "resolve_comments" {
		var ids []string
		if v, ok := fields["ids"]; ok {
			if json.Unmarshal(v, &ids) != nil || ids == nil {
				return nil, usageError("Argument ids must be an array of strings")
			}
		}
		out = append(append(out, "--"), ids...)
	}
	return out, nil
}
