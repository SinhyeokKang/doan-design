package check

import (
	"path"
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
	Canvases   []canvas.Canvas
	Unparsable map[string]string
	Reach      map[string][]CSSRef
	CSS        map[string]canvas.Scan
	// CustomCSS holds, by real path, what each reached stylesheet does with custom properties.
	CustomCSS  map[string]canvas.CustomText
	TokenCSS   TokenCSS
	Served     func(string) bool
	Implements map[string]State

	// MiscasedCanvases are files under a canvas directory whose .html is in another case; they are not canvases.
	MiscasedCanvases []string

	// WithheldServe holds the config's serve entries, as written, that name a
	// .git directory or .env file; the serving scope leaves them out.
	WithheldServe []string
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
	Canvases int `json:"canvases"`
	Errors   int `json:"errors"`
	Warnings int `json:"warnings"`
}

func Summarize(findings []Finding, canvases int) Summary {
	s := Summary{Canvases: canvases}
	for _, f := range findings {
		if f.Severity == "error" {
			s.Errors++
		} else if f.Severity == "warning" {
			s.Warnings++
		}
	}
	return s
}

// viewportHeightVar is the custom property the prototype play scripts define on :root, so a
// canvas uses it without defining it; nothing defines it on the board.
const viewportHeightVar = "--doan-viewport-height"

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
	if len(in.Canvases)+len(in.Unparsable) == 0 {
		add(Finding{Severity: "warning", Code: "no_canvases", Path: ".doan/canvases/", Message: "No canvases found under .doan/canvases/ or .doan/ds/. Write a canvas, then run doan check again."})
	}
	miscased := append([]string(nil), in.MiscasedCanvases...)
	sort.Strings(miscased)
	for _, path := range miscased {
		add(Finding{Severity: "warning", Code: "canvas_extension_case", Path: path, Message: "Only a lower-case .html file is a canvas, so Doan does not list this file. Rename it to end in .html."})
	}
	for path, message := range in.Unparsable {
		add(Finding{Code: "unparsable_canvas", Path: path, Message: "Cannot parse canvas: " + message})
	}
	canvases := append([]canvas.Canvas(nil), in.Canvases...)
	sort.Slice(canvases, func(i, j int) bool { return canvases[i].Path < canvases[j].Path })
	counts := map[string]int{}
	for _, c := range canvases {
		if validID(c) {
			counts[c.ID]++
		}
	}
	if in.TokenCSS.Configured && in.TokenCSS.State != In {
		add(Finding{Code: "token_css_not_found", Path: ".doan/config.json", Target: in.TokenCSS.Path})
	}
	withheld := append([]string(nil), in.WithheldServe...)
	sort.Strings(withheld)
	for _, entry := range withheld {
		add(Finding{Severity: "warning", Code: "serve_withheld", Path: ".doan/config.json", Target: entry, Message: "Doan never serves a .git directory or .env files, so this serve entry is ignored. Ask the user before removing it with doan config --remove-serve."})
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
			if frame.Prototype != nil && !canvas.PrototypeSizeValid(*frame.Prototype) {
				f := base
				f.Code = "invalid_prototype_size"
				f.Frame = frame.ID
				f.Value = *frame.Prototype
				f.Message = "data-doan-prototype=\"" + *frame.Prototype + "\" is not a size; write <width>x<height> in whole pixels from 1 to 99999 with a lowercase x, such as \"390x844\"."
				add(f)
			}
		}
		for _, v := range c.StrayPrototypes {
			f := base
			f.Code = "prototype_not_frame"
			f.Value = v
			f.Message = "data-doan-prototype=\"" + v + "\" is on an element without data-doan-frame; move it to the frame element or remove it."
			add(f)
		}
		for _, g := range c.Gotos {
			// The message depends only on the code and the value, so add folds the same broken link
			// repeated inside one frame into one finding.
			report := func(code, message string) {
				f := base
				f.Code = code
				f.Value = g.Value
				if len(g.Frames) > 0 {
					f.Frame = g.Frames[len(g.Frames)-1]
				}
				f.Message = "data-doan-goto=\"" + g.Value + "\" " + message
				add(f)
			}
			// Empty and shared ids are judged before PrototypeTarget, which checks the length first and
			// accepts the empty id; with exactly one frame left, its order (length, then mark) is the rule's.
			switch n := frames[g.Value]; {
			case g.Value == "" || n == 0:
				report("goto_target_not_found", "names no frame in this canvas; use the data-doan-frame id of a marked frame.")
			case n > 1:
				report("goto_target_shared", "names a frame id that two or more frames share; give each frame its own id.")
			default:
				switch _, refusal := canvas.PrototypeTarget(c, g.Value); refusal {
				case canvas.PrototypeTooLong:
					report("goto_target_not_prototype", "names a frame whose id is longer than 200 characters; shorten the id.")
				case canvas.PrototypeNotMarked:
					report("goto_target_not_prototype", "names a frame that is not marked for prototyping; add data-doan-prototype to that frame.")
				}
			}
			inside := false
			for _, id := range g.Frames {
				if canvas.Playable(c, id) {
					inside = true
					break
				}
			}
			if !inside {
				report("goto_outside_prototype", "is not inside a frame that can play; put it inside a frame marked with data-doan-prototype.")
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
				case "viewport_height_unit":
					f.Value = detail
					f.Severity = "warning"
					f.Message = "Viewport height unit \"" + detail + "\" resolves against the whole board in the app, so the canvas height chases itself. Use a pixel value instead. In a data-doan-prototype frame, use var(--doan-viewport-height, <H>px)."
				case "viewport_height_no_fallback":
					f.Token = detail
					f.Severity = "warning"
					f.Message = "Doan sets " + detail + " only while a prototype plays, so on the board and in thumbnails this height does not resolve. Add the fallback: var(" + detail + ", <H>px), with H from the frame's data-doan-prototype WxH."
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
					if !defs[ref.Name] && ref.Name != viewportHeightVar {
						output("undefined_token", ref.Name)
					}
				}
				if in.TokenCSS.Configured {
					for _, v := range s.Colors {
						output("hardcoded_color", v)
					}
				}
			}
			// Linked stylesheets can be the app's product CSS, which an agent cannot fix, so only the
			// canvas's own <style> and style attributes are reported.
			if !shared {
				for _, v := range s.ViewportHeights {
					output("viewport_height_unit", v)
				}
				for _, ref := range s.Refs {
					if ref.Name == viewportHeightVar && !ref.HasFallback {
						output("viewport_height_no_fallback", ref.Name)
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
		for _, ref := range c.UseRefs {
			f := base
			f.Code = "svg_use_not_inline"
			f.Target = ref
			f.Message = "SVG <use> references \"" + ref + "\" outside the canvas, which the app cannot draw; copy the symbol into the canvas and use href=\"#id\"."
			add(f)
		}
		ambiguousURLs(c, in, add, cssSeen)
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

// ambiguousURLs reports each custom-property url() that its users' folders, among the canvas and the stylesheets it
// reaches, resolve to different paths. export refuses the same url()s with the same canvas functions.
func ambiguousURLs(c canvas.Canvas, in Input, add func(Finding), cssSeen map[[3]string]bool) {
	users := canvas.CustomUsers{Elements: c.Elements}
	users.Add(path.Dir(c.Path), c.Custom.Uses)
	var sheets []string
	seen := map[string]bool{}
	for _, ref := range in.Reach[c.Path] {
		if ref.State == In && !seen[ref.RealPath] {
			seen[ref.RealPath] = true
			sheets = append(sheets, ref.RealPath)
			users.Add(path.Dir(ref.RealPath), in.CustomCSS[ref.RealPath].Uses)
		}
	}
	report := func(file string, shared bool, urls []canvas.CSSRef) {
		for _, r := range urls {
			// Per property as well as url: each property holding the url needs its own fix.
			key := [3]string{file, "ambiguous_custom_url", r.Custom + "\x00" + r.Value}
			if cssSeen[key] || !users.Ambiguous(r.Custom, r.Value) {
				continue
			}
			cssSeen[key] = true
			f := Finding{Severity: "warning", Code: "ambiguous_custom_url", Path: file, Token: r.Custom, Value: r.Value,
				Message: "Custom property " + r.Custom + " holds url(" + r.Value + "), which the stylesheets that use it resolve to different paths, so the app shows different files and export refuses it; use the property from stylesheets in one folder only."}
			if !shared {
				f.Canvas = c.ID
			}
			add(f)
		}
	}
	report(c.Path, false, c.Custom.URLs)
	for _, p := range sheets {
		report(p, true, in.CustomCSS[p].URLs)
	}
}
func trimURL(s string) string { return strings.TrimFunc(s, func(r rune) bool { return r <= 32 }) }
