package exporttest

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"unicode/utf16"

	"golang.org/x/net/html"
)

// PrototypeData is the "prototype" member of a general Export page's doan-meta JSON: what the viewer needs to
// write a prototype file for one frame without re-implementing the CLI's escaping.
type PrototypeData struct {
	// Frames are the frames the canvas file lets the CLI export, in document order.
	Frames []struct {
		ID    string // the raw data-doan-frame id
		Name  string // the prototype page's NAME: the title, else the id, escaped as HTML text
		Start string // the "start" value of the prototype page's META: the id as JSON
		Group int    // index into Groups
		Mark  string // the raw data-doan-prototype value, the player's viewport before the run reports one
	}
	// Refused names, once per id, the frames of the file the CLI refuses to export: "unmarked" or "shared".
	Refused []struct{ ID, Reason string }
	// Groups are the "frames" values of the prototype page's META, as JSON text, one per link group.
	Groups []string
	// Page is the prototype page with every placeholder but NAME, FONT, META and SRCDOC filled, cut at them.
	Page []string
	// Isolate is the script that replaces the measure script in the canvas.
	Isolate string
	// Measure is where the measure script sits in the board iframe's srcdoc, in UTF-16 units.
	Measure struct{ Offset, Length int }
	// External is how many internet URLs the canvas still loads, which the player's download toast mentions.
	External int
}

// GeneralPage is what a browser reads from a general Export page: the board iframe's srcdoc, the font style's text
// and the doan-meta JSON, all decoded.
type GeneralPage struct {
	Srcdoc string
	// Font is the text of the page's <style id="doan-font">, which a prototype file carries as its own.
	Font string
	// MetaJSON is the doan-meta script's text, which the viewer's own code parses.
	MetaJSON string
	Meta     struct {
		Name      string
		Width     int
		Prototype *PrototypeData
	}
}

// ReadGeneral parses a general Export page the way a browser would.
func ReadGeneral(page []byte) (GeneralPage, error) {
	doc, err := html.Parse(bytes.NewReader(page))
	if err != nil {
		return GeneralPage{}, err
	}
	var g GeneralPage
	var meta string
	iframes, metas, fonts := 0, 0, 0
	var visit func(*html.Node)
	visit = func(n *html.Node) {
		if n.Type == html.ElementNode {
			switch {
			case n.Data == "iframe" && attr(n, "id") == "canvas":
				iframes++
				g.Srcdoc = attr(n, "srcdoc")
			case n.Data == "script" && attr(n, "id") == "doan-meta" && n.FirstChild != nil:
				metas++
				meta = n.FirstChild.Data
			case n.Data == "style" && attr(n, "id") == "doan-font" && n.FirstChild != nil:
				fonts++
				g.Font = n.FirstChild.Data
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			visit(c)
		}
	}
	visit(doc)
	if iframes != 1 || metas != 1 || fonts != 1 {
		return GeneralPage{}, errors.New("not a general Export page")
	}
	if err := json.Unmarshal([]byte(meta), &g.Meta); err != nil {
		return GeneralPage{}, err
	}
	g.MetaJSON = meta
	return g, nil
}

func attr(n *html.Node, key string) string {
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val
		}
	}
	return ""
}

// StitchPrototype writes one frame's prototype file as the viewer's browser code does, only joining the page's fragments.
// Indexes are UTF-16 units; for a canvas that is not valid UTF-8 the Go conversion here is not the browser's decoder.
func StitchPrototype(page []byte, frame string) ([]byte, error) {
	g, err := ReadGeneral(page)
	if err != nil {
		return nil, err
	}
	p := g.Meta.Prototype
	if p == nil {
		return nil, errors.New("the page carries no prototype data")
	}
	if len(p.Page) != 6 {
		return nil, errors.New("the prototype page is not cut in six")
	}
	for _, r := range p.Refused {
		if r.ID == frame {
			return nil, errors.New("refused: " + r.Reason)
		}
	}
	for _, f := range p.Frames {
		if f.ID != frame {
			continue
		}
		if f.Group < 0 || f.Group >= len(p.Groups) {
			return nil, errors.New("group out of range")
		}
		units := utf16.Encode([]rune(g.Srcdoc))
		at, n := p.Measure.Offset, p.Measure.Length
		if at < 0 || n < 0 || at+n > len(units) {
			return nil, errors.New("measure script out of range")
		}
		measure := string(utf16.Decode(units[at : at+n]))
		if !strings.HasPrefix(measure, "<script>(function () {\n") || !strings.HasSuffix(measure, "\n})();</script>") {
			return nil, errors.New("the measure range is not the measure script")
		}
		canvas := string(utf16.Decode(units[:at])) + p.Isolate + string(utf16.Decode(units[at+n:]))
		escaped := strings.NewReplacer("&", "&amp;", `"`, "&quot;").Replace(canvas)
		return []byte(p.Page[0] + f.Name + p.Page[1] + g.Font + p.Page[2] + f.Start + p.Page[3] + p.Groups[f.Group] + p.Page[4] + escaped + p.Page[5]), nil
	}
	return nil, errors.New("not in the canvas file")
}
