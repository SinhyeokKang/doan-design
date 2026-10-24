package cli

import (
	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
	"github.com/SinhyeokKang/doan-design/cli/internal/check"
	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
	"os"
	"path/filepath"
	"strings"
)

func checkState(s repo.State) check.State {
	switch s {
	case repo.Inside:
		return check.In
	case repo.Outside:
		return check.Outside
	default:
		return check.Missing
	}
}
func CheckInput(r repo.Repository) (check.Input, error) {
	in := check.Input{Canvases: []canvas.Canvas{}, Unparsable: map[string]string{}, Reach: map[string][]check.CSSRef{}, CSS: map[string]canvas.Scan{}, Implements: map[string]check.State{}, CommentFileIDs: []string{}}
	files, e := readCanvases(r.Root)
	if e != nil {
		return in, e
	}
	comments, e := repo.CommentFiles(r.Root)
	if e != nil {
		return in, e
	}
	for _, f := range comments {
		in.CommentFileIDs = append(in.CommentFileIDs, f.ID)
	}
	if r.Config.TokenCSS != "" {
		state, p, e := repo.Resolve(r.Root, r.Root, r.Config.TokenCSS)
		if e != nil {
			return in, e
		}
		if state == repo.Inside {
			st, e := os.Stat(filepath.Join(r.Root, p))
			if e != nil {
				return in, e
			}
			if !st.Mode().IsRegular() {
				state = repo.Missing
			}
		}
		in.TokenCSS = check.TokenCSS{Configured: true, Path: r.Config.TokenCSS, RealPath: p, State: checkState(state)}
	}
	served, e := repo.Scope(r.Root, r.Config)
	if e != nil {
		return in, e
	}
	in.Served = func(p string) bool {
		for _, s := range served {
			if p == s || strings.HasPrefix(p, s+"/") {
				return true
			}
		}
		return false
	}
	for _, file := range files {
		c := file.Model
		if file.ParseError != nil {
			in.Unparsable[c.Path] = file.ParseError.Error()
			continue
		}
		in.Canvases = append(in.Canvases, c)
		for _, frame := range c.Frames {
			if frame.Implements == nil {
				continue
			}
			p := *frame.Implements
			if p == "" {
				in.Implements[p] = check.Missing
				continue
			}
			s, _, e := repo.Resolve(r.Root, r.Root, p)
			if e != nil {
				return in, e
			}
			in.Implements[p] = checkState(s)
		}
		visited := map[string]bool{}
		var visit func(string, string, bool) error
		visit = func(from, href string, direct bool) error {
			p, ok := canvas.LocalPath(href)
			if !ok {
				return nil
			}
			state, real, e := repo.Resolve(r.Root, filepath.Join(r.Root, filepath.Dir(from)), p)
			if e != nil {
				return e
			}
			if state == repo.Inside {
				st, e := os.Stat(filepath.Join(r.Root, real))
				if e != nil {
					return e
				}
				if !st.Mode().IsRegular() {
					state = repo.Missing
				}
			}
			if !direct && state == repo.Missing {
				return nil
			}
			in.Reach[c.Path] = append(in.Reach[c.Path], check.CSSRef{From: from, Href: href, RealPath: real, State: checkState(state), Direct: direct})
			if state != repo.Inside || visited[real] {
				return nil
			}
			visited[real] = true
			scan, ok := in.CSS[real]
			if !ok {
				b, e := os.ReadFile(filepath.Join(r.Root, real))
				if e != nil {
					return e
				}
				scan = canvas.ScanCSS(string(b), canvas.Stylesheet)
				in.CSS[real] = scan
			}
			for _, href := range scan.Imports {
				if e := visit(real, href, false); e != nil {
					return e
				}
			}
			return nil
		}
		for _, href := range append(append([]string{}, c.Links...), c.Styles.Imports...) {
			if e := visit(c.Path, href, true); e != nil {
				return in, e
			}
		}
	}
	return in, nil
}
func Check(ctx Context, f Flags, args []string) (Outcome, *Error) {
	if len(args) != 0 {
		return Outcome{}, usageError("check takes no positional arguments")
	}
	r, failure := repository(ctx, f)
	if failure != nil {
		return Outcome{}, failure
	}
	in, e := CheckInput(r)
	if e != nil {
		return Outcome{}, internal(e)
	}
	findings := check.Run(in)
	summary := check.Summarize(findings, len(in.Canvases)+len(in.Unparsable))
	exit := 0
	if summary.Errors > 0 {
		exit = 4
	}
	return Outcome{Result: map[string]any{"findings": findings, "summary": summary}, Exit: exit}, nil
}
