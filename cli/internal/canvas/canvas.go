package canvas

import (
	"bytes"
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
}
type Canvas struct {
	Path, ID, Title, WidthRaw        string
	HasID, IDDup, HasWidth, WidthDup bool
	Width                            int
	BodyMeta                         map[string]bool
	Frames                           []Frame
	DoanIDs, Links, ExternalURLs     []string
	Styles                           Scan
}

var widthPattern = regexp.MustCompile(`^[1-9][0-9]*$`)
var schemePattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9+.-]*:`)

func trimURL(s string) string {
	a, b := 0, len(s)
	for a < b && s[a] <= 32 {
		a++
	}
	for b > a && s[b-1] <= 32 {
		b--
	}
	return s[a:b]
}
func IsExternal(href string) bool {
	s := lower(trimURL(href))
	return strings.HasPrefix(s, "http:") || strings.HasPrefix(s, "https:") || strings.HasPrefix(s, "//")
}
func LocalPath(href string) (string, bool) {
	s := trimURL(href)
	if schemePattern.MatchString(s) || strings.HasPrefix(s, "//") {
		return "", false
	}
	if i := strings.IndexAny(s, "?#"); i >= 0 {
		s = s[:i]
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
func Parse(path string, data []byte) Canvas {
	c := Canvas{Path: path, BodyMeta: map[string]bool{}, Frames: []Frame{}, DoanIDs: []string{}, Links: []string{}, ExternalURLs: []string{}, Styles: Scan{Defs: map[string]bool{}}}
	// A bytes.Reader cannot fail, and the HTML5 parser repairs malformed markup.
	root, err := html.Parse(bytes.NewReader(data))
	if err != nil {
		return c
	}
	external := map[string]bool{}
	addURL := func(s string) {
		if IsExternal(s) {
			external[trimURL(s)] = true
		}
	}
	titleSeen := false
	var visit func(*html.Node, bool)
	visit = func(n *html.Node, inHead bool) {
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
			if n.Data == "title" && !titleSeen {
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
				c.Frames = append(c.Frames, f)
			}
			if id, ok := attrs["data-doan-id"]; ok {
				c.DoanIDs = append(c.DoanIDs, id)
			}
			if n.Data == "style" {
				c.Styles.merge(ScanCSS(textContent(n), Stylesheet))
			}
			if v, ok := attrs["style"]; ok {
				c.Styles.merge(ScanCSS(v, Declarations))
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
			if n.Namespace == "svg" && (n.Data == "use" || n.Data == "image") {
				addURL(attrs["href"])
				addURL(attrs["xlink:href"])
			}
			if n.Data == "img" || n.Data == "source" {
				for _, u := range srcsetURLs(attrs["srcset"]) {
					addURL(u)
				}
			}
		}
		for child := n.FirstChild; child != nil; child = child.NextSibling {
			visit(child, inHead)
		}
	}
	visit(root, false)
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
	return c
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
