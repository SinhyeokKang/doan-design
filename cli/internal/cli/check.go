package cli

import (
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
	"github.com/SinhyeokKang/doan-design/cli/internal/check"
	"github.com/SinhyeokKang/doan-design/cli/internal/export"
	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
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
	return checkInput(r, repo.NewResolver(r.Root), nil)
}

// resolver is shared by every canvas, stylesheet and implements path of one check.
func checkInput(r repo.Repository, resolver *repo.Resolver, inspected func([]canvasFile)) (check.Input, error) {
	in := check.Input{Canvases: []canvas.Canvas{}, Unparsable: map[string]string{}, Reach: map[string][]check.CSSRef{}, CSS: map[string]canvas.Scan{}, CustomCSS: map[string]canvas.CustomText{}, Implements: map[string]check.State{}}
	files, e := scanCanvases(r.Root)
	if e != nil {
		return in, e
	}
	if in.MiscasedCanvases, e = repo.MiscasedCanvases(r.Root); e != nil {
		return in, e
	}
	if inspected != nil {
		readable := make([]canvasFile, 0, len(files))
		for _, file := range files {
			if file.ReadError == nil {
				readable = append(readable, file)
			}
		}
		inspected(readable)
	}
	for _, file := range files {
		if file.ReadError != nil {
			return in, file.ReadError
		}
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
	for _, entry := range r.Config.Serve {
		state, real, e := repo.Resolve(r.Root, r.Root, entry)
		if e != nil {
			return in, e
		}
		if repo.Withheld(filepath.ToSlash(filepath.Clean(entry))) || (state == repo.Inside && repo.Withheld(real)) {
			in.WithheldServe = append(in.WithheldServe, entry)
		}
	}
	served, e := repo.Scope(r.Root, r.Config)
	if e != nil {
		return in, e
	}
	in.Served = func(p string) bool { return repo.Served(p, served) }
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
			s, _, e := resolver.Resolve(r.Root, p)
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
			state, real, e := resolver.Resolve(filepath.Join(r.Root, filepath.Dir(from)), p)
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
				text := string(b)
				scan = canvas.ScanCSS(text, canvas.Stylesheet)
				in.CSS[real] = scan
				in.CustomCSS[real] = canvas.ScanCustom(text, canvas.Stylesheet)
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
	r, failure := repository(ctx, f)
	if failure != nil {
		return Outcome{}, failure
	}
	for _, arg := range args {
		if _, failure := checkPathKind(arg); failure != nil {
			return Outcome{}, failure
		}
	}
	var inspected []canvasFile
	in, e := checkInput(r, repo.NewResolver(r.Root), func(files []canvasFile) { inspected = files })
	if e != nil {
		recordSessions(ctx, r.Root, inspected)
		return Outcome{}, internal(e)
	}
	checked := len(in.Canvases) + len(in.Unparsable)
	inScope := checked
	if len(args) > 0 {
		listed := make([]string, 0, checked)
		for _, c := range in.Canvases {
			listed = append(listed, c.Path)
		}
		for p := range in.Unparsable {
			listed = append(listed, p)
		}
		if in.Scope, failure = checkScope(r.Root, in, listed, args); failure != nil {
			return Outcome{}, failure
		}
		if in.Scope != nil {
			inScope = len(in.Scope)
		}
	}
	// A path error records nothing, so this waits until the paths are resolved.
	defer recordSessions(ctx, r.Root, inspected)
	findings := check.Run(in)
	summary := check.Summarize(findings, inScope)
	exit := 0
	if summary.Errors > 0 {
		exit = 4
	}
	o := Outcome{Result: map[string]any{"findings": findings, "summary": summary}, Exit: exit}
	if len(args) > 0 {
		o.Checked = &checked
	}
	return o, nil
}

type checkKind int

const (
	checkCanvas checkKind = iota
	checkCSS
	checkConfig
)

// checkPathKind reads only the path string, so a path of no accepted kind fails before any canvas is read.
func checkPathKind(arg string) (checkKind, *Error) {
	clean := filepath.Clean(arg)
	escapes := !filepath.IsAbs(arg) && (clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)))
	switch {
	case arg == "" || strings.HasSuffix(arg, "/") || escapes:
	case strings.EqualFold(filepath.Ext(arg), ".html"):
		return checkCanvas, nil
	case filepath.Ext(arg) == ".css":
		return checkCSS, nil
	case filepath.Base(arg) == "config.json":
		return checkConfig, nil
	}
	return 0, pathKindError(arg)
}

func pathKindError(arg string) *Error {
	return usageError("check takes paths inside the repo to canvases (.html), stylesheets (.css) or .doan/config.json: " + arg)
}

// checkScope turns check's paths into the canvases whose findings it reports; nil, for the config, means all.
// root is the repository's canonical root; listed holds every canvas check read.
func checkScope(root string, in check.Input, listed, args []string) (map[string]bool, *Error) {
	scope := map[string]bool{}
	whole := false
	for _, arg := range args {
		kind, failure := checkPathKind(arg)
		if failure != nil {
			return nil, failure
		}
		abs := arg
		if !filepath.IsAbs(abs) {
			abs = filepath.Join(root, abs)
		}
		switch kind {
		case checkCanvas:
			// Only the folder is resolved: a canvas link is not listed, so it must not resolve to its target.
			if _, inside, e := realInRepo(root, filepath.Dir(abs)); e != nil {
				return nil, internal(e)
			} else if !inside {
				return nil, pathKindError(arg)
			}
			p, ok := export.MatchListed(root, listed, arg)
			if !ok {
				return nil, &Error{Code: "canvas_not_found", Message: "Canvas not found: " + canvasArgLabel(root, arg), NextSteps: []string{"Run `doan ls --json` and pass a path it lists"}}
			}
			scope[p] = true
		case checkConfig:
			p, inside, e := realInRepo(root, abs)
			if e != nil {
				return nil, internal(e)
			}
			if !inside || p != ".doan/config.json" {
				return nil, pathKindError(arg)
			}
			whole = true
		case checkCSS:
			p, inside, e := realInRepo(root, abs)
			if e != nil {
				return nil, internal(e)
			}
			if !inside {
				return nil, pathKindError(arg)
			}
			found := false
			for c, refs := range in.Reach {
				for _, ref := range refs {
					reached := ref.State == check.In && ref.RealPath == p
					if ref.State == check.Missing && ref.Direct {
						// A deleted stylesheet has no real path; compare where the canvas's href would have put it.
						href, _ := canvas.LocalPath(ref.Href)
						q, inside, e := realInRepo(root, filepath.Join(root, filepath.Dir(ref.From), href))
						if e != nil {
							return nil, internal(e)
						}
						reached = inside && q == p
					}
					if reached {
						scope[c] = true
						found = true
					}
				}
			}
			if !found {
				return nil, usageError("No canvas links or imports " + p)
			}
		}
	}
	if whole {
		return nil, nil
	}
	return scope, nil
}

// realInRepo returns abs relative to the repository with links and the root's other spellings resolved; a missing
// tail is kept as written after its nearest existing folder.
func realInRepo(root, abs string) (string, bool, error) {
	existing, rest := filepath.Clean(abs), ""
	for {
		state, rel, e := repo.InsideRelative(root, existing)
		if e != nil {
			return "", false, e
		}
		switch state {
		case repo.Inside:
			return path.Join(rel, filepath.ToSlash(rest)), true, nil
		case repo.Outside:
			return "", false, nil
		}
		parent := filepath.Dir(existing)
		if parent == existing {
			return "", false, nil
		}
		rest = filepath.Join(filepath.Base(existing), rest)
		existing = parent
	}
}
