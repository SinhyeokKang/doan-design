package check

import (
	"regexp"
	"sort"
	"strings"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
)

type State string

const (
	In      State = "in"
	Missing State = "missing"
	Outside State = "outside"
)

type CSSRef struct {
	From, Href, RealPath string
	State                State
	Direct               bool
}
type TokenCSS struct {
	Configured     bool
	Path, RealPath string
	State          State
}
type Input struct {
	Canvases       []canvas.Canvas
	Unparsable     map[string]string
	Reach          map[string][]CSSRef
	CSS            map[string]canvas.Scan
	TokenCSS       TokenCSS
	Served         func(string) bool
	Implements     map[string]State
	CommentFileIDs []string
}
type Finding struct {
	Severity string `json:"severity"`
	Code     string `json:"code"`
	Message  string `json:"message"`
	Path     string `json:"path"`
	Canvas   string `json:"canvas,omitempty"`
	Frame    string `json:"frame,omitempty"`
	Element  string `json:"element,omitempty"`
	Token    string `json:"token,omitempty"`
	URL      string `json:"url,omitempty"`
	Target   string `json:"target,omitempty"`
	Value    string `json:"value,omitempty"`
}
type Summary struct {
	Errors   int `json:"errors"`
	Warnings int `json:"warnings"`
}

func Summarize(findings []Finding) Summary {
	var s Summary
	for _, f := range findings {
		if f.Severity == "error" {
			s.Errors++
		} else if f.Severity == "warning" {
			s.Warnings++
		}
	}
	return s
}

var idPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

func validID(c canvas.Canvas) bool { return c.HasID && !c.IDDup && idPattern.MatchString(c.ID) }
func Run(in Input) []Finding {
	findings := []Finding{}
	seen := map[Finding]bool{}
	add := func(f Finding) {
		if f.Severity == "" {
			f.Severity = "error"
		}
		if f.Message == "" {
			f.Message = strings.ReplaceAll(f.Code, "_", " ")
		}
		if !seen[f] {
			findings = append(findings, f)
			seen[f] = true
		}
	}
	for path, message := range in.Unparsable {
		add(Finding{Code: "unparsable_canvas", Path: path, Message: "Cannot parse canvas: " + message})
	}
	canvases := append([]canvas.Canvas(nil), in.Canvases...)
	sort.Slice(canvases, func(i, j int) bool { return canvases[i].Path < canvases[j].Path })
	counts := map[string]int{}
	ids := map[string]bool{}
	for _, c := range canvases {
		if validID(c) {
			counts[c.ID]++
		}
		if c.HasID {
			ids[c.ID] = true
		}
	}
	if in.TokenCSS.Configured && in.TokenCSS.State != In {
		add(Finding{Code: "token_css_not_found", Path: ".doan/config.json", Target: in.TokenCSS.Path})
	}
	// CSS findings are shared across canvases; the first unresolved canvas wins.
	cssSeen := map[[3]string]bool{}
	for _, c := range canvases {
		base := Finding{Path: c.Path, Canvas: c.ID}
		emit := func(code string) { f := base; f.Code = code; add(f) }
		if !c.HasID {
			f := base
			f.Code = "missing_canvas_id"
			if c.BodyMeta["doan:canvas"] {
				f.Message = "missing canvas id in head (found in body)"
			}
			add(f)
		} else if !validID(c) {
			emit("invalid_canvas_id")
		} else if counts[c.ID] > 1 {
			emit("duplicate_canvas_id")
		}
		if !c.HasWidth {
			f := base
			f.Code = "missing_width"
			if c.BodyMeta["doan:width"] {
				f.Message = "missing width in head (found in body)"
			}
			add(f)
		} else if c.Width == 0 || c.WidthDup {
			f := base
			f.Code = "invalid_width"
			f.Value = c.WidthRaw
			add(f)
		}
		frames := map[string]int{}
		elements := map[string]int{}
		for _, f := range c.Frames {
			frames[f.ID]++
		}
		for _, id := range c.DoanIDs {
			elements[id]++
		}
		for id, n := range frames {
			f := base
			f.Frame = id
			if id == "" {
				f.Code = "empty_frame_id"
				add(f)
			}
			if n > 1 {
				f.Code = "duplicate_frame_id"
				add(f)
			}
		}
		for id, n := range elements {
			f := base
			f.Element = id
			if id == "" {
				f.Code = "empty_doan_id"
				add(f)
			}
			if n > 1 {
				f.Code = "duplicate_doan_id"
				add(f)
			}
		}
		for _, frame := range c.Frames {
			if frame.Implements == nil {
				continue
			}
			target := *frame.Implements
			state := in.Implements[target]
			f := base
			f.Frame = frame.ID
			f.Target = target
			if state == Outside {
				f.Code = "path_outside_repo"
				add(f)
			} else if target == "" || state != In {
				f.Code = "implements_not_found"
				add(f)
			}
		}
		defs := map[string]bool{}
		for d := range c.Styles.Defs {
			defs[d] = true
		}
		for _, ref := range in.Reach[c.Path] {
			if ref.State == In {
				for d := range in.CSS[ref.RealPath].Defs {
					defs[d] = true
				}
			}
		}
		scan := func(path string, s canvas.Scan, shared bool) {
			output := func(code, detail string) {
				f := Finding{Path: path, Code: code}
				if !shared || code == "undefined_token" {
					f.Canvas = c.ID
				}
				switch code {
				case "undefined_token":
					f.Token = detail
				case "hardcoded_color":
					f.Value = detail
					f.Severity = "warning"
				case "external_url":
					f.URL = detail
					f.Severity = "warning"
				}
				if shared {
					key := [3]string{path, code, detail}
					if cssSeen[key] {
						return
					}
					cssSeen[key] = true
				}
				add(f)
			}
			tokenFile := shared && in.TokenCSS.Configured && in.TokenCSS.State == In && path == in.TokenCSS.RealPath
			if !tokenFile {
				for _, ref := range s.Refs {
					if !defs[ref.Name] {
						output("undefined_token", ref.Name)
					}
				}
				if in.TokenCSS.Configured {
					for _, v := range s.Colors {
						output("hardcoded_color", v)
					}
				}
			}
			if shared {
				for _, u := range append(append([]string(nil), s.URLs...), s.Imports...) {
					if canvas.IsExternal(u) {
						output("external_url", trimURL(u))
					}
				}
			}
		}
		scan(c.Path, c.Styles, false)
		for _, u := range c.ExternalURLs {
			f := base
			f.Code = "external_url"
			f.Severity = "warning"
			f.URL = u
			add(f)
		}
		for _, ref := range in.Reach[c.Path] {
			f := base
			f.Target = ref.Href
			if !ref.Direct {
				f.Path = ref.From
				f.Canvas = ""
			}
			switch ref.State {
			case Outside:
				f.Code = "path_outside_repo"
				add(f)
			case In:
				if in.Served != nil && !in.Served(ref.RealPath) {
					f.Code = "css_not_served"
					add(f)
				}
				scan(ref.RealPath, in.CSS[ref.RealPath], true)
			default:
				if ref.Direct {
					f.Code = "local_css_not_found"
					add(f)
				}
			}
		}
	}
	for _, id := range in.CommentFileIDs {
		if !ids[id] {
			add(Finding{Severity: "warning", Code: "orphan_comment_file", Path: ".doan/comments/" + id + ".jsonl", Canvas: id})
		}
	}
	sort.Slice(findings, func(i, j int) bool {
		a, b := findings[i], findings[j]
		ak := []string{a.Path, a.Severity, a.Code, a.Canvas, a.Frame, a.Element, a.Token, a.URL, a.Target, a.Value}
		bk := []string{b.Path, b.Severity, b.Code, b.Canvas, b.Frame, b.Element, b.Token, b.URL, b.Target, b.Value}
		for k := range ak {
			if ak[k] != bk[k] {
				return ak[k] < bk[k]
			}
		}
		return false
	})
	return findings
}
func trimURL(s string) string { return strings.TrimFunc(s, func(r rune) bool { return r <= 32 }) }
