// Package designskill holds Doan's design presets: a catalog (catalog.json), one adapted Markdown body per preset
// (presets/<id>.md) and the upstream notices, all embedded in the CLI. The data files are kept apart from this code so
// presets can be edited without touching Go.
package designskill

import (
	"bytes"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"path"
	"regexp"
	"strings"
	"sync"
)

//go:embed catalog.json presets notices
var files embed.FS

type Source struct {
	Repository string `json:"repository"`
	Commit     string `json:"commit"`
	Path       string `json:"path"`
}

type Preset struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Scope       string   `json:"scope"`
	Sources     []Source `json:"sources"`
}

// Summary is a preset's list row; a list never carries bodies or sources.
type Summary struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Scope       string `json:"scope"`
}

func (p Preset) Summary() Summary {
	return Summary{ID: p.ID, Title: p.Title, Description: p.Description, Scope: p.Scope}
}

type Catalog struct {
	presets []Preset
	index   map[string]int
	bodies  map[string]string
}

var (
	idPattern     = regexp.MustCompile(`^[a-z]+(-[a-z]+)*$`)
	commitPattern = regexp.MustCompile(`^[0-9a-f]{40}$`)
	markdownLink  = regexp.MustCompile(`\]\(\s*<?([^)\s>]*)`)
	// A link reference definition ("[floor]: ./craft-floor.md") resolves like an inline link; its destination may sit
	// on the next line or inside angle brackets.
	linkDefinition = regexp.MustCompile(`(?m)^ {0,3}\[[^\]]+\]:\s*<?([^\s>]*)`)
	// skill/reference/... in a source line names a file at the pinned commit; a bare reference/... or agents/... is a
	// link the upstream skill resolved against its own folder, which a returned body cannot follow.
	upstreamPath = regexp.MustCompile(`(?:^|[^\w/.-])((?:reference|agents|scripts)/[\w./-]+)`)
	placeholders = regexp.MustCompile(`\{\{[^}]*\}\}|<skill-base-dir>`)
	notices      = []string{"LICENSE", "NOTICE.md", "platform-design-skills-LICENSE", "MODIFICATIONS.md"}
)

const markerTag = "[doan:design-skill]"

// Marker is the line that ends every returned body. A reader without it has a truncated body. The doan skill guide
// ends with "[doan:skill] end of guide v<version>" instead, so the two cannot be confused.
func Marker(id, version string) string {
	return markerTag + " end of preset " + id + " v" + version + "\n"
}

// authoredMarker is the last line of presets/<id>.md; Body appends the running CLI version to it.
func authoredMarker(id string) string { return markerTag + " end of preset " + id + "\n" }

// ValidID reports whether id fits the preset id grammar. A valid id can still be missing from the catalog.
func ValidID(id string) bool { return idPattern.MatchString(id) }

var load = sync.OnceValues(func() (*Catalog, error) { return parse(files) })

// Load returns the embedded catalog, validated once per process.
func Load() (*Catalog, error) { return load() }

// Presets returns every preset in catalog order. The slice is a copy.
func (c *Catalog) Presets() []Preset {
	out := make([]Preset, len(c.presets))
	for i, p := range c.presets {
		out[i] = p
		out[i].Sources = append([]Source(nil), p.Sources...)
	}
	return out
}

// Lookup finds a preset by exact catalog id; it never builds a path from the id.
func (c *Catalog) Lookup(id string) (Preset, bool) {
	i, ok := c.index[id]
	if !ok {
		return Preset{}, false
	}
	p := c.presets[i]
	p.Sources = append([]Source(nil), p.Sources...)
	return p, true
}

// Body returns the complete preset text, ending with Marker(id, version).
func (c *Catalog) Body(id, version string) (string, bool) {
	b, ok := c.bodies[id]
	if !ok {
		return "", false
	}
	return strings.TrimSuffix(b, "\n") + " v" + version + "\n", true
}

func parse(fsys fs.FS) (*Catalog, error) {
	raw, err := fs.ReadFile(fsys, "catalog.json")
	if err != nil {
		return nil, err
	}
	var data struct {
		Presets []Preset `json:"presets"`
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&data); err != nil {
		return nil, fmt.Errorf("catalog.json: %w", err)
	}
	if err := dec.Decode(&struct{}{}); err != io.EOF {
		return nil, errors.New("catalog.json: unexpected data after the catalog object")
	}
	if len(data.Presets) == 0 {
		return nil, errors.New("catalog.json lists no presets")
	}
	c := &Catalog{presets: data.Presets, index: map[string]int{}, bodies: map[string]string{}}
	var problems []error
	fail := func(format string, args ...any) { problems = append(problems, fmt.Errorf(format, args...)) }
	for i, p := range data.Presets {
		if !idPattern.MatchString(p.ID) {
			fail("invalid preset id %q", p.ID)
			continue
		}
		if _, dup := c.index[p.ID]; dup {
			fail("duplicate preset id %q", p.ID)
			continue
		}
		c.index[p.ID] = i
		if p.Title == "" || p.Description == "" || p.Scope == "" {
			fail("preset %q needs title, description and scope", p.ID)
		}
		if len(p.Sources) == 0 {
			fail("preset %q has no sources", p.ID)
		}
		for j, s := range p.Sources {
			if s.Repository == "" || s.Path == "" || !commitPattern.MatchString(s.Commit) {
				fail("preset %q source %d needs repository, a 40-character commit and path", p.ID, j)
			}
		}
		name := "presets/" + p.ID + ".md"
		b, err := fs.ReadFile(fsys, name)
		if err != nil {
			fail("preset %q has no %s", p.ID, name)
			continue
		}
		body := string(b)
		for _, problem := range checkBody(name, p, body) {
			fail("%s", problem)
		}
		c.bodies[p.ID] = body
	}
	entries, err := fs.ReadDir(fsys, "presets")
	if err != nil {
		return nil, err
	}
	for _, e := range entries {
		id, isMarkdown := strings.CutSuffix(e.Name(), ".md")
		if _, listed := c.index[id]; !isMarkdown || !listed || e.IsDir() {
			fail("presets/%s has no catalog entry", e.Name())
		}
	}
	for _, name := range notices {
		if b, err := fs.ReadFile(fsys, path.Join("notices", name)); err != nil || len(b) == 0 {
			fail("notices/%s is missing or empty", name)
		}
	}
	if len(problems) > 0 {
		return nil, errors.Join(problems...)
	}
	return c, nil
}

func checkBody(name string, p Preset, body string) []string {
	var problems []string
	if !strings.HasSuffix(body, "\n"+authoredMarker(p.ID)) {
		problems = append(problems, fmt.Sprintf("%s must end with %q", name, strings.TrimSuffix(authoredMarker(p.ID), "\n")))
	}
	if n := strings.Count(body, markerTag); n > 1 {
		problems = append(problems, fmt.Sprintf("%s must contain one marker, found %d", name, n))
	}
	// Each body carries its own provenance line, so the modification notice travels with the text an agent reads.
	for _, s := range p.Sources {
		if !strings.Contains(body, s.Path) {
			problems = append(problems, fmt.Sprintf("%s does not name source %s", name, s.Path))
		}
		if !strings.Contains(body, s.Commit) {
			problems = append(problems, fmt.Sprintf("%s does not name source commit %s", name, s.Commit))
		}
	}
	for _, m := range placeholders.FindAllString(body, -1) {
		problems = append(problems, fmt.Sprintf("%s keeps upstream placeholder %q", name, m))
	}
	links := append(markdownLink.FindAllStringSubmatch(body, -1), linkDefinition.FindAllStringSubmatch(body, -1)...)
	for _, m := range links {
		target := m[1]
		if !strings.HasPrefix(target, "https://") && !strings.HasPrefix(target, "http://") && !strings.HasPrefix(target, "#") {
			problems = append(problems, fmt.Sprintf("%s keeps unresolved relative path %q", name, target))
		}
	}
	for _, m := range upstreamPath.FindAllStringSubmatch(body, -1) {
		problems = append(problems, fmt.Sprintf("%s keeps unresolved relative path %q", name, m[1]))
	}
	return problems
}
