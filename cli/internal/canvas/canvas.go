package canvas

import (
	"bytes"
	"fmt"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"golang.org/x/net/html"
)

type Frame struct {
	ID                string
	Title, Implements *string
	// Prototype is the raw data-doan-prototype value, nil when absent.
	Prototype *string
}

// Goto is one data-doan-goto element outside <template>.
type Goto struct {
	Value string
	// Frames holds the ids of the frames enclosing the element, outermost first, including the element
	// itself when it is a frame.
	Frames []string
}
type Canvas struct {
	Path, ID, Title, WidthRaw        string
	HasID, IDDup, HasWidth, WidthDup bool
	Width                            int
	BodyMeta                         map[string]bool
	Frames                           []Frame
	DoanIDs, Links, ExternalURLs     []string
	Styles                           Scan
	// UseRefs holds the reference of each SVG <use> outside <template> that
	// names something other than a fragment of this document, as written.
	UseRefs []string
	// Custom is what the canvas's own <style> elements and style attributes
	// do with custom properties.
	Custom CustomText
	// Elements is what selectors can match in the canvas, or nil when the
	// canvas can change its elements (CustomUsers then counts every rule).
	Elements *Elements
	// StrayPrototypes holds the raw data-doan-prototype value of each element
	// outside <template> that is not a data-doan-frame element.
	StrayPrototypes []string
	// Gotos holds each data-doan-goto element in document order.
	Gotos []Goto
}

// IDPattern is the form of a <meta name="doan:canvas"> id (ARCHITECTURE §1 convention 2).
var IDPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// ValidID reports whether the canvas declares exactly one well-formed id.
func (c Canvas) ValidID() bool { return c.HasID && !c.IDDup && IDPattern.MatchString(c.ID) }

var prototypePattern = regexp.MustCompile(`^[1-9][0-9]{0,4}x[1-9][0-9]{0,4}$`)

// PrototypeSizeValid reports whether a data-doan-prototype value is
// "<width>x<height>", whole CSS pixels from 1 to 99999 with no padding.
func PrototypeSizeValid(v string) bool { return prototypePattern.MatchString(v) }

var widthPattern = regexp.MustCompile(`^[1-9][0-9]*$`)
var schemePattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9+.-]*:`)

// TrimURL strips what the URL parser strips: leading and trailing C0 controls and spaces.
func TrimURL(s string) string {
	return strings.TrimFunc(s, func(r rune) bool { return r <= 32 })
}
func IsExternal(href string) bool {
	s := lower(TrimURL(href))
	return strings.HasPrefix(s, "http:") || strings.HasPrefix(s, "https:") || strings.HasPrefix(s, "//")
}

// UseNotInline reports whether a <use> reference names something other than
// a fragment of the same document.
func UseNotInline(ref string) bool {
	s := TrimURL(ref)
	return s != "" && s[0] != '#'
}
func LocalPath(href string) (string, bool) {
	s := TrimURL(href)
	if schemePattern.MatchString(s) || strings.HasPrefix(s, "//") {
		return "", false
	}
	if i := strings.IndexAny(s, "?#"); i >= 0 {
		s = s[:i]
	}
	if s == "" {
		return "", false
	}
	p, err := url.PathUnescape(s)
	if err != nil {
		return "", false
	}
	return p, true
}
func textContent(n *html.Node) string {
	var b strings.Builder
	var visit func(*html.Node)
	visit = func(n *html.Node) {
		if n.Type == html.TextNode {
			b.WriteString(n.Data)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			visit(c)
		}
	}
	visit(n)
	return b.String()
}
func words(s string) []string {
	return strings.FieldsFunc(s, func(r rune) bool { return r < 128 && asciiSpace(byte(r)) })
}
func Parse(path string, data []byte) (Canvas, error) {
	c := Canvas{Path: path, BodyMeta: map[string]bool{}, Frames: []Frame{}, StrayPrototypes: []string{}, Gotos: []Goto{}, DoanIDs: []string{}, Links: []string{}, ExternalURLs: []string{}, Styles: Scan{Defs: map[string]bool{}},
		Custom: CustomText{Uses: newCustomUse()}}
	// Parser resource limits can fail even when the reader cannot.
	root, err := html.Parse(bytes.NewReader(data))
	if err != nil {
		return c, fmt.Errorf("parse %s: %w", path, err)
	}
	external := map[string]bool{}
	addURL := func(s string) {
		if IsExternal(s) {
			external[TrimURL(s)] = true
		}
	}
	titleSeen := false
	var visit func(*html.Node, bool, []string)
	visit = func(n *html.Node, inHead bool, frames []string) {
		if n.Type == html.ElementNode {
			if n.Data == "template" {
				return
			}
			if n.Data == "head" {
				inHead = true
			}
			attrs := map[string]string{}
			for _, a := range n.Attr {
				k := a.Key
				if a.Namespace != "" {
					k = a.Namespace + ":" + k
				}
				if _, ok := attrs[k]; !ok {
					attrs[k] = a.Val
				}
			}
			if n.Data == "meta" {
				name := lower(attrs["name"])
				if name == "doan:canvas" || name == "doan:width" {
					if !inHead {
						c.BodyMeta[name] = true
					} else if name == "doan:canvas" {
						if c.HasID {
							c.IDDup = true
						} else {
							c.HasID = true
							c.ID = attrs["content"]
						}
					} else {
						if c.HasWidth {
							c.WidthDup = true
						} else {
							c.HasWidth = true
							c.WidthRaw = attrs["content"]
							if widthPattern.MatchString(c.WidthRaw) {
								v, e := strconv.Atoi(c.WidthRaw)
								if e == nil {
									c.Width = v
								}
							}
						}
					}
				}
			}
			if n.Data == "title" && n.Namespace == "" && !titleSeen {
				c.Title = strings.Join(words(textContent(n)), " ")
				titleSeen = true
			}
			if id, ok := attrs["data-doan-frame"]; ok {
				f := Frame{ID: id}
				if v, ok := attrs["data-doan-title"]; ok {
					f.Title = &v
				}
				if v, ok := attrs["data-doan-implements"]; ok {
					f.Implements = &v
				}
				if v, ok := attrs["data-doan-prototype"]; ok {
					f.Prototype = &v
				}
				c.Frames = append(c.Frames, f)
				frames = append(frames, id)
			} else if v, ok := attrs["data-doan-prototype"]; ok {
				c.StrayPrototypes = append(c.StrayPrototypes, v)
			}
			if v, ok := attrs["data-doan-goto"]; ok {
				// Copied: siblings append to the same parent stack, so a shared backing array would let a
				// later sibling overwrite this link's frames.
				c.Gotos = append(c.Gotos, Goto{Value: v, Frames: append([]string{}, frames...)})
			}
			if id, ok := attrs["data-doan-id"]; ok {
				c.DoanIDs = append(c.DoanIDs, id)
			}
			if n.Data == "style" {
				text := textContent(n)
				c.Styles.merge(ScanCSS(text, Stylesheet))
				c.Custom.merge(ScanCustom(text, Stylesheet))
			}
			if v, ok := attrs["style"]; ok {
				c.Styles.merge(ScanCSS(v, Declarations))
				c.Custom.merge(ScanCustom(v, Declarations))
			}
			if n.Data == "link" {
				if href, ok := attrs["href"]; ok {
					for _, rel := range words(attrs["rel"]) {
						if lower(rel) == "stylesheet" {
							c.Links = append(c.Links, href)
							break
						}
					}
					addURL(href)
				}
			}
			switch n.Data {
			case "script", "img", "iframe", "video", "audio", "source", "embed", "track":
				addURL(attrs["src"])
			}
			if n.Data == "video" {
				addURL(attrs["poster"])
			}
			if n.Data == "object" {
				addURL(attrs["data"])
			}
			if n.Namespace == "svg" && n.Data == "image" {
				addURL(attrs["href"])
				addURL(attrs["xlink:href"])
			}
			// A <use> that leaves the canvas is svg_use_not_inline, not an external resource: the app never loads it.
			// href wins over xlink:href whenever it is present, as in the browser.
			if n.Namespace == "svg" && n.Data == "use" {
				ref, ok := attrs["href"]
				if !ok {
					ref = attrs["xlink:href"]
				}
				if UseNotInline(ref) {
					c.UseRefs = append(c.UseRefs, ref)
				}
			}
			if n.Data == "img" || n.Data == "source" {
				for _, u := range srcsetURLs(attrs["srcset"]) {
					addURL(u)
				}
			}
		}
		for child := n.FirstChild; child != nil; child = child.NextSibling {
			visit(child, inHead, frames)
		}
	}
	visit(root, false, nil)
	for _, u := range c.Styles.URLs {
		addURL(u)
	}
	for _, u := range c.Styles.Imports {
		addURL(u)
	}
	for u := range external {
		c.ExternalURLs = append(c.ExternalURLs, u)
	}
	sort.Strings(c.ExternalURLs)
	c.Elements = elementsOf(root)
	return c, nil
}

// Elements holds lowercased tag names, classes (".x") and ids ("#x"): quirks mode compares classes and ids
// without case, so lowering only finds more matches. Elements inside <template> count too.
type Elements struct{ keys map[string]bool }

// Match reports whether some compound in needs (selectorNeeds) has every
// key among the elements. A nil Elements matches everything.
func (e *Elements) Match(needs [][]string) bool {
	if e == nil {
		return true
	}
	for _, c := range needs {
		all := true
		for _, k := range c {
			if !e.keys[k] {
				all = false
				break
			}
		}
		if all {
			return true
		}
	}
	return false
}

// ElementsOf parses a canvas for its Elements, as Parse does; a canvas the
// parser refuses gives nil.
func ElementsOf(data []byte) *Elements {
	root, err := html.Parse(bytes.NewReader(data))
	if err != nil {
		return nil
	}
	return elementsOf(root)
}

// elementsOf returns nil when the canvas can change its elements at run time: scripts, event handlers,
// javascript: URLs, SVG animation of class or id, or contenteditable (Enter inserts a <div>).
func elementsOf(root *html.Node) *Elements {
	e := &Elements{keys: map[string]bool{}}
	dynamic := false
	var visit func(*html.Node)
	visit = func(n *html.Node) {
		if dynamic {
			return
		}
		if n.Type == html.ElementNode {
			name := lower(n.Data)
			if name == "script" {
				dynamic = true
				return
			}
			e.keys[name] = true
			for _, a := range n.Attr {
				k := lower(a.Key)
				if strings.HasPrefix(k, "on") || k == "contenteditable" || isJavascriptURL(a.Val) {
					dynamic = true
					return
				}
				if a.Namespace != "" {
					continue
				}
				switch k {
				case "class":
					for _, c := range strings.FieldsFunc(a.Val, func(r rune) bool { return r < 128 && asciiSpace(byte(r)) }) {
						e.keys["."+lower(c)] = true
					}
				case "id":
					e.keys["#"+lower(a.Val)] = true
				case "attributename":
					if (name == "set" || name == "animate") && (lower(trimASCII(a.Val)) == "class" || lower(trimASCII(a.Val)) == "id") {
						dynamic = true
						return
					}
				}
			}
		}
		for ch := n.FirstChild; ch != nil; ch = ch.NextSibling {
			visit(ch)
		}
	}
	visit(root)
	if dynamic {
		return nil
	}
	return e
}

// isJavascriptURL reads a value as the URL parser would: ASCII control
// characters and spaces dropped before the scheme is compared.
func isJavascriptURL(v string) bool {
	v = strings.Map(func(r rune) rune {
		if r <= ' ' {
			return -1
		}
		return r
	}, v)
	return strings.HasPrefix(lower(v), "javascript:")
}
func srcsetURLs(s string) []string {
	var urls []string
	for i := 0; i < len(s); {
		for i < len(s) && (asciiSpace(s[i]) || s[i] == ',') {
			i++
		}
		start := i
		for i < len(s) && !asciiSpace(s[i]) {
			i++
		}
		u := s[start:i]
		trailing := strings.HasSuffix(u, ",")
		u = strings.TrimRight(u, ",")
		if u != "" {
			urls = append(urls, u)
		}
		if trailing {
			continue
		}
		depth := 0
		for i < len(s) {
			ch := s[i]
			i++
			if ch == '(' {
				depth++
			}
			if ch == ')' {
				depth--
			}
			if ch == ',' && depth == 0 {
				break
			}
		}
	}
	return urls
}
