package export

import (
	"bytes"
	"embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"html"
	"slices"
	"strconv"
	"strings"

	nethtml "golang.org/x/net/html"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
)

// The viewer files are the page `doan export` writes around a canvas. Their
// tests are in app/src/main/exportViewer.test.ts.
//
//go:embed viewer/*
var viewerFS embed.FS

// Meta is the one source of the canvas name and width: the page title and
// header, the CSS-only iframe width, and the JSON shell.js reads all come from
// these two values.
type Meta struct {
	Project string // project folder name (canvas viewer only)
	Name    string // file stem
	Width   int    // doan:width
	// External is how many internet URLs the inlined canvas still loads (Inline's External), which the CLI reports
	// as `external`. The general Export carries it for the player's download toast (canvas viewer only).
	External int
}

var byteOrderMark = []byte("\xef\xbb\xbf")

// Assemble wraps the rewritten canvas HTML in the viewer page. The canvas goes
// into a sandboxed iframe's srcdoc, with the measure script injected into its
// head. The placeholders in shell.html are replaced in one pass, so a canvas
// (or a name) that contains one is never expanded. META also carries, judged
// from c (the canvas file as parsed), what the viewer needs to write any
// frame's prototype file by joining strings (prototypeExports).
func Assemble(m Meta, c canvas.Canvas, canvasHTML []byte) ([]byte, error) {
	if m.Width < 1 {
		return nil, errors.New("canvas width must be a positive integer")
	}
	files := map[string]string{}
	for _, name := range []string{"shell.html", "shell.css", "lib.js", "shell.js", "measure.js", "inspect.js", "inspectSelection.js", "inspectPanel.js", "inspectMessage.js", "inspectView.js", "viewerApp.js", "player.js"} {
		b, err := viewerFS.ReadFile("viewer/" + name)
		if err != nil {
			return nil, err
		}
		files[name] = string(b)
	}
	shell, style, lib, shellJS, measure := files["shell.html"], files["shell.css"], files["lib.js"], files["shell.js"], files["measure.js"]
	font, err := geistStyle()
	if err != nil {
		return nil, err
	}
	// Both scripts are wrapped in a function: lib.js and the other files declare
	// top-level names that must not become globals of the canvas. In a player
	// window (this file opened again by the board's Play, lib.js PLAY_HASH)
	// player.js plays and the board's files, which share one function of their
	// own, never run.
	board := files["inspectPanel.js"] + "\n" + files["inspectMessage.js"] + "\n" + files["inspectView.js"] + "\n" + shellJS
	shellScript := "(function () {\n" + lib + "\n" + files["viewerApp.js"] + "\n" + files["player.js"] + "\nif (!startPlayer()) (function () {\n" + board + "\n})();\n})();"
	measureScript := "<script>(function () {\n" + lib + "\n" + files["inspect.js"] + "\n" + files["inspectSelection.js"] + "\n" + measure + "\n})();</script>"

	// A browser drops a byte order mark; in a srcdoc string it would be text and
	// put the canvas into quirks mode.
	src := bytes.TrimPrefix(canvasHTML, byteOrderMark)
	at := measureOffset(src)
	srcdoc := [][]byte{src[:at], []byte(measureScript), src[at:]}

	exports, err := prototypeExports(c, src[:at], measureScript)
	if err != nil {
		return nil, err
	}
	exports.External = m.External
	// shell.js reads name and width; the viewer's prototype code reads the rest.
	meta, err := json.Marshal(struct {
		Name      string       `json:"name"`
		Width     int          `json:"width"`
		Prototype frameExports `json:"prototype"`
	}{m.Name, m.Width, exports})
	if err != nil {
		return nil, err
	}

	values := map[string]string{
		"{{NAME}}":    html.EscapeString(m.Name),
		"{{WIDTH}}":   strconv.Itoa(m.Width),
		"{{PROJECT}}": html.EscapeString(m.Project),
		"{{INITIAL}}": html.EscapeString(projectInitial(m.Project)),
		"{{HUE}}":     projectHue(m.Project),
		// json.Marshal writes every "<" as <, so the value can neither end the
		// script element nor open an HTML comment.
		"{{META}}":   string(meta),
		"{{FONT}}":   font,
		"{{STYLE}}":  style,
		"{{SCRIPT}}": shellScript,
	}
	return fillPage(shell, values, srcdoc), nil
}

// geistStyle is the FONT value of both pages: the app window's Geist (viewer/Geist.woff2 is a copy of
// app/src/renderer/public/fonts/geist/Geist.woff2, which go:embed cannot reach) as a data: URL with the app's
// @font-face values, after the font's license notice, which the OFL asks to travel with it. The viewer file holds
// it once: the player copies this element's text into the prototype file it writes rather than META carrying it.
func geistStyle() (string, error) {
	woff2, err := viewerFS.ReadFile("viewer/Geist.woff2")
	if err != nil {
		return "", err
	}
	license, err := viewerFS.ReadFile("viewer/Geist-LICENSE.txt")
	if err != nil {
		return "", err
	}
	return "/*\n" + string(license) + "*/\n@font-face {\n  font-family: \"Geist\";\n  src: url(data:font/woff2;base64," +
		base64.StdEncoding.EncodeToString(woff2) + ") format(\"woff2\");\n  font-style: normal;\n  font-weight: 100 900;\n  font-display: swap;\n}\n", nil
}

// ProtoFrame is one frame of an exported prototype's group.
type ProtoFrame struct {
	ID    string // data-doan-frame
	Title string // data-doan-title, "" when the frame has none
}

// Proto names what an exported prototype plays: the frame it starts on and that frame's link group, the frames a
// recipient can reach from it. The CLI judged both from the canvas file before assembling (each frame exists once and
// is marked).
type Proto struct {
	Frame  string       // the start frame's id
	Frames []ProtoFrame // the start frame's link group in document order, the start frame among them
}

// AssemblePrototype wraps the rewritten canvas HTML in the prototype page. The page holds the whole canvas once, with
// isolate.js first in its head, in a hidden element's data-srcdoc attribute; prototype.js puts it into a new sandboxed
// iframe for every frame it shows, naming the iframe after the frame, which isolate.js reads to hide everything else.
// The group goes into the page as JSON, each frame with the name the page shows (its title, else its id). The static
// tab title names the start frame. It shares Assemble's one-pass placeholder filling, srcdoc escaping, script placement
// and byte order mark removal; only the shell differs. The page shows neither the canvas name nor its width, but takes
// the same Meta as Assemble.
func AssemblePrototype(m Meta, p Proto, canvasHTML []byte) ([]byte, error) {
	if p.Frame == "" {
		return nil, errors.New("prototype frame id must not be empty")
	}
	frames := protoFrames(p.Frames)
	label := ""
	for _, f := range frames {
		if f.ID == p.Frame {
			label = f.Title
		}
	}
	if label == "" {
		return nil, errors.New("prototype start frame must be in its group")
	}
	shell, values, isolateScript, err := prototypeFiles()
	if err != nil {
		return nil, err
	}
	// json.Marshal writes "<", ">", "&", U+2028 and U+2029 as escapes, so no id or title can end the script element
	// the group sits in or open an HTML comment in it.
	meta, err := json.Marshal(struct {
		Start  string       `json:"start"`
		Frames []protoFrame `json:"frames"`
	}{p.Frame, frames})
	if err != nil {
		return nil, err
	}

	src := bytes.TrimPrefix(canvasHTML, byteOrderMark)
	at := measureOffset(src)
	srcdoc := [][]byte{src[:at], []byte(isolateScript), src[at:]}
	values["{{NAME}}"] = html.EscapeString(label)
	values["{{META}}"] = string(meta)
	return fillPage(shell, values, srcdoc), nil
}

// protoFrame is one frame of a prototype page's group JSON, named as the page shows it: its title, else its id.
type protoFrame struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

func protoFrames(frames []ProtoFrame) []protoFrame {
	out := make([]protoFrame, 0, len(frames))
	for _, f := range frames {
		name := f.Title
		if name == "" {
			name = f.ID
		}
		out = append(out, protoFrame{f.ID, name})
	}
	return out
}

// prototypeFiles reads the prototype page: its shell, the STYLE and SCRIPT values, and the isolation script that
// goes first in the canvas's head.
func prototypeFiles() (shell string, values map[string]string, isolateScript string, err error) {
	files := map[string]string{}
	for _, name := range []string{"prototype.html", "prototype.css", "prototype.js", "isolate.js"} {
		b, err := viewerFS.ReadFile("viewer/" + name)
		if err != nil {
			return "", nil, "", err
		}
		files[name] = string(b)
	}
	font, err := geistStyle()
	if err != nil {
		return "", nil, "", err
	}
	values = map[string]string{
		"{{FONT}}":   font,
		"{{STYLE}}":  files["prototype.css"],
		"{{SCRIPT}}": "(function () {\n" + files["prototype.js"] + "\n})();",
	}
	return files["prototype.html"], values, "<script>(function () {\n" + files["isolate.js"] + "\n})();</script>", nil
}

// ProtoGroup is what a prototype file plays from start: the start frame's link group as the file states it, uncut
// (canvas.LinkGroups), each frame with its title. A playable start frame is in exactly one group, and each id in it
// names one frame, so its title is not ambiguous. `doan export --prototype` and the general Export's prototype data
// both judge the group here.
func ProtoGroup(c canvas.Canvas, start string) Proto {
	proto := Proto{Frame: start}
	for _, group := range canvas.LinkGroups(c) {
		if slices.Contains(group, start) {
			proto.Frames = groupFrames(c, group)
		}
	}
	return proto
}

func groupFrames(c canvas.Canvas, ids []string) []ProtoFrame {
	frames := make([]ProtoFrame, 0, len(ids))
	for _, id := range ids {
		f := ProtoFrame{ID: id}
		if played, _ := canvas.PrototypeTarget(c, id); played.Title != nil {
			f.Title = *played.Title
		}
		frames = append(frames, f)
	}
	return frames
}

// frameExports is the "prototype" member of the general Export's META: what the viewer needs to write the
// prototype file of a frame (the file `doan export --frame <id> --prototype` writes) by joining strings, so the
// browser never re-implements this file's escaping or judgment. For a frame f of Frames the file is
//
//	Page[0] + f.Name + Page[1] + font + Page[2] + f.Start + Page[3] + Groups[f.Group] + Page[4] + escape(canvas) + Page[5]
//
// where font is the text of the viewer page's own <style id="doan-font"> (geistStyle), canvas is the board iframe's srcdoc as the browser reads it, with the Measure range replaced by Isolate,
// and escape writes & as &amp; and " as &quot;. The result is byte-identical for an LF-only, valid UTF-8, NUL-free
// canvas; otherwise the parser has normalized the srcdoc (CR LF, invalid UTF-8, NUL) and the file parses the same.
type frameExports struct {
	// Frames are the frames the file lets the CLI export (canvas.PrototypeTarget), in document order.
	Frames []exportFrame `json:"frames"`
	// Refused names the frames the file has but the CLI refuses, once per id in the order of first appearance. An
	// id the file does not have at all is a frame a script made. An empty id and an id over 200 UTF-16 units are left
	// out, since no running frame can play with one.
	Refused []exportRefusal `json:"refused"`
	// Groups holds each link group's "frames" JSON, in canvas.LinkGroups order.
	Groups []string `json:"groups"`
	// Page is prototype.html with STYLE and SCRIPT filled, cut at NAME, FONT, the META values and SRCDOC.
	Page []string `json:"page"`
	// Isolate is the script prototype files carry first in the canvas's head.
	Isolate string `json:"isolate"`
	// Measure is the measure script's place in the srcdoc string, in UTF-16 units.
	Measure measureRange `json:"measure"`
	// External is Meta.External: a prototype file holds the whole canvas, so it loads as many internet URLs. The
	// player's download toast says so under the app's condition (more than none).
	External int `json:"external"`
}

type exportFrame struct {
	ID    string `json:"id"`
	Name  string `json:"name"`  // NAME: the title, else the id, escaped as HTML text
	Start string `json:"start"` // META's start value: the id as JSON
	Group int    `json:"group"` // index into Groups
	// Mark is the frame's raw data-doan-prototype value: the player window's viewport for the frame until its run
	// reports the mark it found, as the app's prototype window starts at the board's mark.
	Mark string `json:"mark"`
}

type exportRefusal struct {
	ID     string `json:"id"`
	Reason string `json:"reason"` // "unmarked" (no valid mark) or "shared" (another frame has the id)
}

type measureRange struct {
	Offset int `json:"offset"`
	Length int `json:"length"`
}

// prototypeExports judges c's frames and pre-renders the prototype page around them. before is the canvas before
// the measure script, which goes in at that point.
func prototypeExports(c canvas.Canvas, before []byte, measureScript string) (frameExports, error) {
	shell, values, isolateScript, err := prototypeFiles()
	if err != nil {
		return frameExports{}, err
	}
	var pieces []string
	var cuts []string
	var piece strings.Builder
	fillShell(shell, func(s string) { piece.WriteString(s) }, func(key string) {
		switch key {
		case "{{NAME}}", "{{FONT}}", "{{META}}", srcdocKey:
			pieces, cuts = append(pieces, piece.String()), append(cuts, key)
			piece.Reset()
		default:
			piece.WriteString(values[key])
		}
	})
	pieces = append(pieces, piece.String())
	if !slices.Equal(cuts, []string{"{{NAME}}", "{{FONT}}", "{{META}}", srcdocKey}) {
		return frameExports{}, errors.New("prototype.html must hold NAME, FONT, META and SRCDOC once each, in that order")
	}
	out := frameExports{
		Frames:  []exportFrame{},
		Refused: []exportRefusal{},
		Groups:  []string{},
		// META is the struct AssemblePrototype marshals, whose JSON is always {"start":<start>,"frames":<frames>}.
		Page:    []string{pieces[0], pieces[1], pieces[2] + `{"start":`, `,"frames":`, `}` + pieces[3], pieces[4]},
		Isolate: isolateScript,
		// The browser reads the srcdoc as UTF-16 after decoding and newline normalization, which a CR LF or a broken
		// byte before the head would shift from a byte count.
		Measure: measureRange{browserUnits(before), browserUnits([]byte(measureScript))},
	}
	group := map[string]int{}
	for i, ids := range canvas.LinkGroups(c) {
		frames, err := json.Marshal(protoFrames(groupFrames(c, ids)))
		if err != nil {
			return frameExports{}, err
		}
		out.Groups = append(out.Groups, string(frames))
		for _, id := range ids {
			group[id] = i
		}
	}
	seen := map[string]bool{}
	for _, f := range c.Frames {
		if f.ID == "" || seen[f.ID] {
			continue
		}
		seen[f.ID] = true
		played, refusal := canvas.PrototypeTarget(c, f.ID)
		switch refusal {
		case canvas.PrototypeOK:
			start, err := json.Marshal(f.ID)
			if err != nil {
				return frameExports{}, err
			}
			name := f.ID
			if played.Title != nil && *played.Title != "" {
				name = *played.Title
			}
			out.Frames = append(out.Frames, exportFrame{f.ID, html.EscapeString(name), string(start), group[f.ID], played.Size})
		case canvas.PrototypeShared:
			out.Refused = append(out.Refused, exportRefusal{f.ID, "shared"})
		case canvas.PrototypeNotMarked:
			out.Refused = append(out.Refused, exportRefusal{f.ID, "unmarked"})
		}
	}
	return out, nil
}

// browserUnits is the length, in UTF-16 units, of the string a browser reads for b inside an attribute value of a
// UTF-8 page: the WHATWG UTF-8 decoder writes one U+FFFD for each maximal invalid subpart (Go's decoder writes one
// per byte), and the input stream reads CR LF as one LF. A NUL becomes U+FFFD, which keeps the count.
func browserUnits(b []byte) int {
	n := 0
	for i := 0; i < len(b); {
		c := b[i]
		if c < 0x80 {
			if c != '\r' || i+1 == len(b) || b[i+1] != '\n' {
				n++
			}
			i++
			continue
		}
		need, lo, hi := 0, byte(0x80), byte(0xBF)
		switch {
		case c >= 0xC2 && c <= 0xDF:
			need = 1
		case c == 0xE0:
			need, lo = 2, 0xA0
		case c == 0xED:
			need, hi = 2, 0x9F
		case c >= 0xE1 && c <= 0xEF:
			need = 2
		case c == 0xF0:
			need, lo = 3, 0x90
		case c == 0xF4:
			need, hi = 3, 0x8F
		case c >= 0xF1 && c <= 0xF3:
			need = 3
		default:
			n++
			i++
			continue
		}
		j := i + 1
		for k := 0; k < need && j < len(b) && b[j] >= lo && b[j] <= hi; k++ {
			lo, hi = 0x80, 0xBF
			j++
		}
		switch {
		case j-i <= need:
			// A cut sequence: one U+FFFD, and the byte that broke it is read again.
			n++
		case need == 3:
			n += 2
		default:
			n++
		}
		i = j
	}
	return n
}

// fillPage writes shell into one buffer of its final size, with the srcdoc
// parts escaped straight into it: an escaped copy of the canvas and a growing
// buffer would each hold the whole page again.
func fillPage(shell string, values map[string]string, srcdoc [][]byte) []byte {
	size := 0
	fillShell(shell, func(s string) { size += len(s) }, func(key string) {
		if key != srcdocKey {
			size += len(values[key])
			return
		}
		for _, part := range srcdoc {
			size += len(part) + 4*bytes.Count(part, []byte("&")) + 5*bytes.Count(part, []byte(`"`))
		}
	})
	out := bytes.NewBuffer(make([]byte, 0, size))
	fillShell(shell, func(s string) { out.WriteString(s) }, func(key string) {
		if key != srcdocKey {
			out.WriteString(values[key])
			return
		}
		for _, part := range srcdoc {
			writeEscaped(out, part)
		}
	})
	return out.Bytes()
}

const srcdocKey = "{{SRCDOC}}"

var placeholders = []string{"{{PROJECT}}", "{{INITIAL}}", "{{HUE}}", "{{NAME}}", "{{WIDTH}}", "{{META}}", "{{FONT}}", "{{STYLE}}", "{{SCRIPT}}", srcdocKey}

// fillShell walks shell once, passing the text between placeholders to text
// and each placeholder to value. Like a strings.Replacer, it never looks at
// what replaces a placeholder, so a canvas (or a name) that contains one is
// not expanded.
func fillShell(shell string, text func(string), value func(key string)) {
	for {
		i := strings.Index(shell, "{{")
		if i < 0 {
			text(shell)
			return
		}
		key := ""
		for _, p := range placeholders {
			if strings.HasPrefix(shell[i:], p) {
				key = p
				break
			}
		}
		if key == "" {
			// One byte on: "{{{NAME}}" holds a placeholder at its second brace.
			text(shell[:i+1])
			shell = shell[i+1:]
			continue
		}
		text(shell[:i])
		value(key)
		shell = shell[i+len(key):]
	}
}

var attributeEscaper = strings.NewReplacer("&", "&amp;", `"`, "&quot;")

// writeEscaped is attributeEscaper for bytes, which it would first copy into
// a string.
func writeEscaped(out *bytes.Buffer, b []byte) {
	for {
		i := bytes.IndexAny(b, `&"`)
		if i < 0 {
			out.Write(b)
			return
		}
		out.Write(b[:i])
		if b[i] == '&' {
			out.WriteString("&amp;")
		} else {
			out.WriteString("&quot;")
		}
		b = b[i+1:]
	}
}

// measureOffset is where the measure script goes: the first thing in the head
// the parser would build, so its font listener is in place before anything
// loads. After an explicit <head>; without one, after <html>; without that,
// after the doctype. Never before the doctype: a script first in the document
// puts a standards-mode canvas into quirks mode.
func measureOffset(src []byte) int {
	z := nethtml.NewTokenizer(bytes.NewReader(src))
	pos, after, sawHTML := 0, 0, false
	for {
		tt := z.Next()
		end := pos + len(z.Raw())
		switch tt {
		case nethtml.DoctypeToken:
			if !sawHTML {
				after = end
			}
		case nethtml.TextToken:
			if len(bytes.Trim(z.Raw(), "\t\n\f\r ")) > 0 {
				return after
			}
		case nethtml.StartTagToken, nethtml.SelfClosingTagToken:
			name, _ := z.TagName()
			switch string(name) {
			case "html":
				if !sawHTML {
					sawHTML, after = true, end
				}
			case "head":
				return end
			default:
				return after
			}
		case nethtml.EndTagToken:
			return after
		case nethtml.ErrorToken:
			return after
		}
		pos = end
	}
}
