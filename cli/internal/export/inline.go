package export

import (
	"path"
	"sort"
	"strings"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
)

// Result is a canvas with every reached local asset inlined.
type Result struct {
	// HTML is the rewritten canvas; it is complete only when Refused is empty.
	HTML []byte
	// External holds the http:, https: and `//` URLs left as links, as
	// written (trimmed), sorted and unique.
	External []string
	// Links holds the local navigation references left as written: <a href>,
	// <area href>, <form action> and <link> rels that are not loaded.
	Links []string
	// Assets holds each inlined file once, by real repo-relative path, with
	// its size on disk, sorted by path.
	Assets []Asset
	// Refused holds each reference that blocks the export, in document order.
	Refused []Refusal
}

type Asset struct {
	Path string
	Size int64
}

// Refusal names a blocked reference. From is the repo-relative path of the
// canvas or CSS file that holds Href; no absolute path appears.
type Refusal struct {
	From, Href, Reason string
}

// Inline rewrites the canvas source src at the listed canvas path so that it
// needs no file from the repository. Only files the app would serve are read:
// references outside the repository or the serving scope, local frames, and
// missing files the canvas names directly are refused. Missing files named
// inside CSS files stay as written, as the app also fails to load them. The
// error is for file-system failures only.
func Inline(root string, config repo.Config, canvasPath string, src []byte) (Result, error) {
	scope, err := repo.Scope(root, config)
	if err != nil {
		return Result{}, err
	}
	in := &inliner{root: root, scope: scope, files: map[string][]byte{}, sheets: map[string]string{}, external: map[string]bool{}, links: map[string]bool{}, refusedSeen: map[Refusal]bool{}}
	var cut bool
	ref := in.ref(canvasPath, true, nil, &cut)
	html := rewriteHTML(src, ref, func(text string, mode canvas.Mode) string {
		return rewriteCSS(text, mode, func(href string, kind refKind) (string, bool) { return ref(kind, href) })
	})
	if in.err != nil {
		return Result{}, in.err
	}
	res := Result{HTML: html, External: keys(in.external), Links: keys(in.links), Assets: []Asset{}, Refused: in.refused}
	for p, b := range in.files {
		res.Assets = append(res.Assets, Asset{p, int64(len(b))})
	}
	sort.Slice(res.Assets, func(i, j int) bool { return res.Assets[i].Path < res.Assets[j].Path })
	if res.Refused == nil {
		res.Refused = []Refusal{}
	}
	return res, nil
}

type inliner struct {
	root        string
	scope       []string
	files       map[string][]byte
	sheets      map[string]string // inlined CSS by real path, when no cycle was cut below it
	external    map[string]bool
	links       map[string]bool
	refused     []Refusal
	refusedSeen map[Refusal]bool
	err         error
}

// ref returns the replacement callback for references in the file from.
// direct is true for the canvas itself. ancestors is the @import chain being
// followed; cut reports that a cycle was cut somewhere below.
func (in *inliner) ref(from string, direct bool, ancestors []string, cut *bool) func(refKind, string) (string, bool) {
	return func(kind refKind, href string) (string, bool) {
		if in.err != nil {
			return "", false
		}
		h := trimURL(href)
		switch classifyRef(kind, href) {
		case classExternal:
			in.external[h] = true
			// A `//` URL would resolve against the shell's file: URL, and not at
			// all inside a data: stylesheet.
			if strings.HasPrefix(h, "//") {
				return "https:" + h, true
			}
		case classLink:
			in.links[h] = true
		case classRefuse:
			in.refuse(from, h, ReasonFrame)
		case classInline:
			r, err := resolveAsset(in.root, in.scope, path.Dir(from), href)
			if err != nil {
				in.err = err
				return "", false
			}
			switch r.State {
			case assetRefused:
				in.refuse(from, h, r.Reason)
			case assetMissing:
				if direct {
					in.refuse(from, h, ReasonMissing)
				}
			case assetInside:
				uri, below, err := in.inlineFile(r.Real, kind, ancestors)
				if err != nil {
					in.err = err
					return "", false
				}
				*cut = *cut || below
				return uri + fragment(h), true
			}
		}
		return "", false
	}
}

func (in *inliner) refuse(from, href, reason string) {
	r := Refusal{from, href, reason}
	if !in.refusedSeen[r] {
		in.refusedSeen[r] = true
		in.refused = append(in.refused, r)
	}
}

func (in *inliner) read(real string) ([]byte, error) {
	if b, ok := in.files[real]; ok {
		return b, nil
	}
	b, err := ReadFile(in.root, real)
	if err != nil {
		return nil, err
	}
	in.files[real] = b
	return b, nil
}

// inlineFile returns the data URI for a resolved file. A stylesheet whose
// type the server sends as CSS has its own references inlined first; any
// other type is sent as its bytes, as the app would serve it.
func (in *inliner) inlineFile(real string, kind refKind, ancestors []string) (string, bool, error) {
	mime := mimeType(real)
	if kind != kindStylesheet || !strings.HasPrefix(mime, "text/css") {
		b, err := in.read(real)
		if err != nil {
			return "", false, err
		}
		return dataURI(mime, b), false, nil
	}
	// Only the ancestor stack stops a cycle. A global visited set would empty
	// the second import of a diamond (a→c, b→c) and change the cascade.
	for _, a := range ancestors {
		if a == real {
			return dataURI(mime, nil), true, nil
		}
	}
	if uri, ok := in.sheets[real]; ok {
		return uri, false, nil
	}
	b, err := in.read(real)
	if err != nil {
		return "", false, err
	}
	chain := append(ancestors[:len(ancestors):len(ancestors)], real)
	var cut bool
	ref := in.ref(real, false, chain, &cut)
	text := rewriteCSS(string(b), canvas.Stylesheet, func(href string, kind refKind) (string, bool) { return ref(kind, href) })
	uri := dataURI(mime, []byte(text))
	// A result with a cut cycle depends on the chain that reached it.
	if !cut {
		in.sheets[real] = uri
	}
	return uri, cut, nil
}

func keys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
