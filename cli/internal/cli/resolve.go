package cli

import (
	"bytes"
	"encoding/json"
	"fmt"
	"github.com/SinhyeokKang/doan-design/cli/internal/comments"
	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
	"path/filepath"
	"sort"
	"strings"
)

func Resolve(ctx Context, f Flags, ids []string) (Outcome, *Error) {
	if len(ids) == 0 || !agentName.MatchString(f.Agent) {
		return Outcome{}, usageError("Provide comment ids and --agent <lowercase-name>")
	}
	r, failure := repository(ctx, f)
	if failure != nil {
		return Outcome{}, failure
	}
	files, e := readComments(r.Root)
	if e != nil {
		return Outcome{}, internal(e)
	}
	wanted := map[string]bool{}
	for _, id := range ids {
		wanted[id] = true
	}
	found := map[string]bool{}
	open := map[string]bool{}
	for _, file := range files {
		for _, c := range file.Fold.Comments {
			found[c.Comment] = true
			if c.Status == "open" {
				open[c.Comment] = true
			}
		}
	}
	missing := []string{}
	for id := range wanted {
		if !found[id] {
			missing = append(missing, id)
		}
	}
	sort.Strings(missing)
	if len(missing) > 0 {
		return Outcome{}, &Error{Code: "comment_not_found", Message: "Comments not found: " + strings.Join(missing, ", "), NextSteps: []string{"Run `doan comments --json` to list open comment ids"}}
	}
	resolved, already := []string{}, []string{}
	for id := range wanted {
		if open[id] {
			resolved = append(resolved, id)
		} else {
			already = append(already, id)
		}
	}
	sort.Strings(resolved)
	sort.Strings(already)
	type pendingAppend struct {
		path string
		data []byte
	}
	appends := []pendingAppend{}
	for _, file := range files {
		var buf bytes.Buffer
		maxAt, ok := comments.MaxAt(formats.ParseLines(file.Text))
		for _, c := range file.Fold.Comments {
			if !wanted[c.Comment] || c.Status != "open" {
				continue
			}
			if ctx.Now == nil || ctx.Random == nil {
				return Outcome{}, internal(fmt.Errorf("missing clock or randomness"))
			}
			at, e := comments.NextAt(maxAt, ok, ctx.Now())
			if e != nil {
				return Outcome{}, internal(fmt.Errorf("%s: %w", file.File.Path, e))
			}
			event, e := comments.NewResolve(c.Comment, f.Agent, at, ctx.Random)
			if e != nil {
				return Outcome{}, internal(e)
			}
			b, e := json.Marshal(event)
			if e != nil {
				return Outcome{}, internal(e)
			}
			var v any
			if e := json.Unmarshal(b, &v); e != nil {
				return Outcome{}, internal(e)
			}
			if e := formats.ValidateCommentEvent(v); e != nil {
				return Outcome{}, internal(e)
			}
			buf.Write(b)
			buf.WriteByte('\n')
			maxAt, ok = at, true
		}
		if buf.Len() > 0 {
			appends = append(appends, pendingAppend{filepath.Join(r.Root, file.File.Path), buf.Bytes()})
		}
	}
	for _, pending := range appends {
		if e := comments.Append(pending.path, pending.data); e != nil {
			return Outcome{}, internal(e)
		}
	}
	return Outcome{Result: map[string]any{"resolved": resolved, "alreadyResolved": already}}, nil
}
