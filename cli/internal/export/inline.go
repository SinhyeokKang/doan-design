package export

import (
	"fmt"
	"path"
	"sort"
	"strings"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
	"github.com/SinhyeokKang/doan-design/cli/internal/repo"
)

// MaxBytes is the export size cap (design: 50 MiB, the app's pasted-image cap).
const MaxBytes int64 = 50 << 20

// Result is a canvas with every reached local asset inlined.
type Result struct {
	// HTML is the rewritten canvas; it is complete only when Refused is empty
	// and TooLarge is false (it is nil then).
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
	// It is partial when TooLarge is true.
	Refused []Refusal
	// TooLarge reports that the output would exceed the limit; Inline stopped
	// there instead of building it.
	TooLarge bool
	// Largest holds up to five files the export reached, largest first, with
	// their sizes on disk (including a file too large to read). It is filled
	// only when TooLarge is true and is empty otherwise.
	Largest []Asset
}

type Asset struct {
	Path string
	Size int64
}

// Refusal names a blocked reference. From is the repo-relative path of the
// canvas or CSS file that holds Href; no absolute path appears. Control
// characters in Href are escaped (\n, \r, \t, \xNN), so a refusal is one line.
type Refusal struct {
	From, Href, Reason string
}

// Inline is InlineLimit with MaxBytes.
func Inline(root string, config repo.Config, canvasPath string, src []byte) (Result, error) {
	return InlineLimit(root, config, canvasPath, src, MaxBytes)
}

// InlineLimit rewrites the canvas source src at the listed canvas path so
// that it needs no file from the repository. Only files the app would serve
// are read: references outside the repository or the serving scope, local
// frames, and missing files the canvas names directly are refused. Missing
// files named inside CSS files stay as written, as the app also fails to load
// them.
//
// It stops with TooLarge as soon as the output is known to exceed limit
// bytes: a file is sized before it is read, and every stylesheet and the
// canvas count the bytes they gain while being rewritten, so repeated
// @import expansion stops early. The error is for file-system failures only.
func InlineLimit(root string, config repo.Config, canvasPath string, src []byte, limit int64) (Result, error) {
	scope, err := repo.Scope(root, config)
	if err != nil {
		return Result{}, err
	}
	in := &inliner{root: root, scope: scope, limit: limit, files: map[string][]byte{}, sizes: map[string]int64{}, sheets: map[string][]sheet{}, external: map[string]bool{}, links: map[string]bool{}, refusedSeen: map[Refusal]bool{}}
	// grown sums only what replacements add, so it never exceeds the real output.
	var grown int64
	ref := in.ref(canvasPath, true, nil, nil, &grown)
	out := rewriteHTML(src, ref, func(text string, mode canvas.Mode) string {
		return rewriteCSS(text, mode, func(href string, kind refKind) (string, bool) { return ref(kind, href) })
	})
	if in.err != nil {
		return Result{}, in.err
	}
	if int64(len(out)) > limit {
		in.tooLarge = true
	}
	res := Result{HTML: out, External: keys(in.external), Links: keys(in.links), Assets: []Asset{}, Refused: in.refused, Largest: []Asset{}}
	for p, b := range in.files {
		res.Assets = append(res.Assets, Asset{p, int64(len(b))})
	}
	sort.Slice(res.Assets, func(i, j int) bool { return res.Assets[i].Path < res.Assets[j].Path })
	if res.Refused == nil {
		res.Refused = []Refusal{}
	}
	if in.tooLarge {
		res.TooLarge = true
		res.HTML = nil
		for p, n := range in.sizes {
			res.Largest = append(res.Largest, Asset{p, n})
		}
		sort.Slice(res.Largest, func(i, j int) bool {
			a, b := res.Largest[i], res.Largest[j]
			return a.Size > b.Size || a.Size == b.Size && a.Path < b.Path
		})
		if len(res.Largest) > 5 {
			res.Largest = res.Largest[:5]
		}
	}
	return res, nil
}

type inliner struct {
	root        string
	scope       []string
	limit       int64
	files       map[string][]byte
	sizes       map[string]int64   // every file sized, read or not
	total       int64              // sum of distinct file sizes
	sheets      map[string][]sheet // inlined CSS by real path
	external    map[string]bool
	links       map[string]bool
	refused     []Refusal
	refusedSeen map[Refusal]bool
	tooLarge    bool
	err         error
}

// sheet is one inlined stylesheet. Its text depends on the @import chain
// only through which of the stylesheets it reached were ancestors (and so
// were cut), recorded in deps; the same file reached by another chain that
// agrees on deps has the same text. Without this, a cut cycle in a dense
// import graph re-expands every simple path.
type sheet struct {
	deps map[string]bool // stylesheet reached → it was an ancestor
	uri  string
}

func (in *inliner) stopped() bool { return in.err != nil || in.tooLarge }

// ref returns the replacement callback for references in the file from.
// direct is true for the canvas itself. ancestors is the @import chain being
// followed; reached collects the stylesheets reached below (nil for the
// canvas, which no chain contains). grown counts
// the size of the output being built from this file: once it passes the
// limit, the whole export does, because that output ends up in it.
func (in *inliner) ref(from string, direct bool, ancestors []string, reached map[string]bool, grown *int64) func(refKind, string) (string, bool) {
	return func(kind refKind, href string) (string, bool) {
		if in.stopped() {
			return "", false
		}
		v, ok := in.replace(from, direct, ancestors, reached, grown, kind, href)
		if ok {
			*grown += int64(len(v))
			if *grown > in.limit {
				in.tooLarge = true
			}
		}
		return v, ok && !in.stopped()
	}
}

func (in *inliner) replace(from string, direct bool, ancestors []string, reached map[string]bool, grown *int64, kind refKind, href string) (string, bool) {
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
			if reached != nil {
				for p := range below {
					reached[p] = true
				}
			}
			return uri + fragment(h), true
		}
	}
	return "", false
}

func (in *inliner) refuse(from, href, reason string) {
	r := Refusal{from, escapeControls(href), reason}
	if !in.refusedSeen[r] {
		in.refusedSeen[r] = true
		in.refused = append(in.refused, r)
	}
}

func escapeControls(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r == '\n':
			b.WriteString(`\n`)
		case r == '\r':
			b.WriteString(`\r`)
		case r == '\t':
			b.WriteString(`\t`)
		case r < 0x20 || r == 0x7f:
			fmt.Fprintf(&b, `\x%02x`, r)
		case r == 0x2028 || r == 0x2029 || r == 0x85:
			fmt.Fprintf(&b, `\u%04x`, r)
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

// read returns a file's bytes. A file bigger than what is left of the limit
// is sized but not read: every file read appears in the output at least
// once, so the export is already too large.
func (in *inliner) read(real string) ([]byte, error) {
	if b, ok := in.files[real]; ok {
		return b, nil
	}
	b, size, err := readFile(in.root, real, in.limit-in.total)
	if err == errOverLimit {
		in.sizes[real] = size
		in.tooLarge = true
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	in.sizes[real] = size
	in.total += size
	in.files[real] = b
	return b, nil
}

// inlineFile returns the data URI for a resolved file and the stylesheets
// it reached, itself included. A stylesheet whose type the server sends as
// CSS has its own references inlined first; any other type is sent as its
// bytes, as the app would serve it.
func (in *inliner) inlineFile(real string, kind refKind, ancestors []string) (string, map[string]bool, error) {
	mime := mimeType(real)
	if kind != kindStylesheet || !strings.HasPrefix(mime, "text/css") {
		b, err := in.read(real)
		if err != nil || in.stopped() {
			return "", nil, err
		}
		return dataURI(mime, b), nil, nil
	}
	ancestor := map[string]bool{}
	for _, a := range ancestors {
		ancestor[a] = true
	}
	// Only the ancestor stack stops a cycle. A global visited set would empty
	// the second import of a diamond (a→c, b→c) and change the cascade.
	if ancestor[real] {
		return dataURI(mime, nil), map[string]bool{real: true}, nil
	}
	for _, s := range in.sheets[real] {
		same := true
		for p, was := range s.deps {
			if ancestor[p] != was {
				same = false
				break
			}
		}
		if same {
			return s.uri, keySet(s.deps), nil
		}
	}
	b, err := in.read(real)
	if err != nil || in.stopped() {
		return "", nil, err
	}
	chain := append(ancestors[:len(ancestors):len(ancestors)], real)
	reached := map[string]bool{real: true}
	var grown int64
	ref := in.ref(real, false, chain, reached, &grown)
	text := rewriteCSS(string(b), canvas.Stylesheet, func(href string, kind refKind) (string, bool) { return ref(kind, href) })
	if in.stopped() {
		return "", nil, nil
	}
	uri := dataURI(mime, []byte(text))
	deps := map[string]bool{}
	for p := range reached {
		deps[p] = ancestor[p]
	}
	in.sheets[real] = append(in.sheets[real], sheet{deps, uri})
	return uri, reached, nil
}

func keySet(m map[string]bool) map[string]bool {
	out := make(map[string]bool, len(m))
	for k := range m {
		out[k] = true
	}
	return out
}

func keys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
