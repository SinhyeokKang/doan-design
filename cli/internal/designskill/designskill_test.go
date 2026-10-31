package designskill

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
)

const upstream = `{"repository": "https://github.com/pbakaus/impeccable", "commit": "d34c87e1a00989ae8dbdd7f6b30b70f23319e860", "path": "skill/reference/clarify.md"}`

func entry(id string) string {
	return `{"id": "` + id + `", "title": "T", "description": "D", "scope": "S", "sources": [` + upstream + `]}`
}

func body(id, text string) string {
	return "# " + id + "\n\n" + text + "\n\nSource: pbakaus/impeccable d34c87e1a00989ae8dbdd7f6b30b70f23319e860 `skill/reference/clarify.md`, modified by Doan.\n\n[doan:design-skill] end of preset " + id + "\n"
}

// validFS is a minimal catalog that passes; each failure case breaks exactly one rule.
func validFS() fstest.MapFS {
	return fstest.MapFS{
		"catalog.json":                           {Data: []byte(`{"presets": [` + entry("clarify") + `, ` + entry("bolder-copy") + `]}`)},
		"presets/clarify.md":                     {Data: []byte(body("clarify", "Rewrite labels."))},
		"presets/bolder-copy.md":                 {Data: []byte(body("bolder-copy", "See [the spec](https://example.com/spec), [below](#verify) and [the docs][docs].\n\n[docs]: https://example.com/docs\n[top]: <#top>"))},
		"notices/LICENSE":                        {Data: []byte("Apache License\n")},
		"notices/NOTICE.md":                      {Data: []byte("# Third-Party Notices\n")},
		"notices/platform-design-skills-LICENSE": {Data: []byte("MIT License\n")},
		"notices/MODIFICATIONS.md":               {Data: []byte("# Doan modifications\n")},
	}
}

func TestParseAcceptsValidCatalog(t *testing.T) {
	c, err := parse(validFS())
	if err != nil {
		t.Fatal(err)
	}
	var ids []string
	for _, p := range c.Presets() {
		ids = append(ids, p.ID)
	}
	if !reflect.DeepEqual(ids, []string{"clarify", "bolder-copy"}) {
		t.Fatalf("catalog order not kept: %v", ids)
	}
	got, ok := c.Body("clarify", "1.2.3")
	if !ok || !strings.HasSuffix(got, "\n[doan:design-skill] end of preset clarify v1.2.3\n") || strings.Count(got, "[doan:design-skill]") != 1 {
		t.Fatalf("body marker: %q", got)
	}
	if got != strings.TrimSuffix(body("clarify", "Rewrite labels."), "\n")+" v1.2.3\n" {
		t.Fatalf("body changed beyond the marker version: %q", got)
	}
}

func TestParseRejectsBrokenCatalogs(t *testing.T) {
	cases := []struct {
		name, want string
		edit       func(fstest.MapFS)
	}{
		{"duplicate id", `duplicate preset id "clarify"`, func(m fstest.MapFS) {
			m["catalog.json"] = &fstest.MapFile{Data: []byte(`{"presets": [` + entry("clarify") + `, ` + entry("clarify") + `]}`)}
			delete(m, "presets/bolder-copy.md")
		}},
		{"missing markdown", `preset "bolder-copy" has no presets/bolder-copy.md`, func(m fstest.MapFS) { delete(m, "presets/bolder-copy.md") }},
		{"markdown without entry", `presets/extra.md has no catalog entry`, func(m fstest.MapFS) {
			m["presets/extra.md"] = &fstest.MapFile{Data: []byte(body("extra", "x"))}
		}},
		{"non-markdown file", `presets/notes.txt has no catalog entry`, func(m fstest.MapFS) {
			m["presets/notes.txt"] = &fstest.MapFile{Data: []byte("x")}
		}},
		{"no sources", `preset "clarify" has no sources`, func(m fstest.MapFS) {
			m["catalog.json"] = &fstest.MapFile{Data: []byte(`{"presets": [{"id": "clarify", "title": "T", "description": "D", "scope": "S", "sources": []}, ` + entry("bolder-copy") + `]}`)}
		}},
		{"sources field absent", `preset "clarify" has no sources`, func(m fstest.MapFS) {
			m["catalog.json"] = &fstest.MapFile{Data: []byte(`{"presets": [{"id": "clarify", "title": "T", "description": "D", "scope": "S"}, ` + entry("bolder-copy") + `]}`)}
		}},
		{"source without path", `preset "clarify" source 0 needs repository, a 40-character commit and path`, func(m fstest.MapFS) {
			m["catalog.json"] = &fstest.MapFile{Data: []byte(`{"presets": [{"id": "clarify", "title": "T", "description": "D", "scope": "S", "sources": [{"repository": "https://github.com/pbakaus/impeccable", "commit": "d34c87e1a00989ae8dbdd7f6b30b70f23319e860", "path": ""}]}, ` + entry("bolder-copy") + `]}`)}
		}},
		{"short commit", `preset "clarify" source 0 needs repository, a 40-character commit and path`, func(m fstest.MapFS) {
			m["catalog.json"] = &fstest.MapFile{Data: []byte(`{"presets": [{"id": "clarify", "title": "T", "description": "D", "scope": "S", "sources": [{"repository": "https://github.com/pbakaus/impeccable", "commit": "d34c87e", "path": "skill/reference/clarify.md"}]}, ` + entry("bolder-copy") + `]}`)}
		}},
		{"body omits a source path", `presets/clarify.md does not name source skill/reference/clarify.md`, func(m fstest.MapFS) {
			m["presets/clarify.md"] = &fstest.MapFile{Data: []byte("# clarify\n\nSource: d34c87e1a00989ae8dbdd7f6b30b70f23319e860, modified by Doan.\n\n[doan:design-skill] end of preset clarify\n")}
		}},
		{"body omits the commit", `presets/clarify.md does not name source commit d34c87e1a00989ae8dbdd7f6b30b70f23319e860`, func(m fstest.MapFS) {
			m["presets/clarify.md"] = &fstest.MapFile{Data: []byte("# clarify\n\nSource: `skill/reference/clarify.md`, modified by Doan.\n\n[doan:design-skill] end of preset clarify\n")}
		}},
		{"empty title", `preset "clarify" needs title, description and scope`, func(m fstest.MapFS) {
			m["catalog.json"] = &fstest.MapFile{Data: []byte(`{"presets": [{"id": "clarify", "title": "", "description": "D", "scope": "S", "sources": [` + upstream + `]}, ` + entry("bolder-copy") + `]}`)}
		}},
		{"unknown field", `catalog.json`, func(m fstest.MapFS) {
			m["catalog.json"] = &fstest.MapFile{Data: []byte(`{"presets": [` + entry("clarify") + `, ` + entry("bolder-copy") + `], "aliases": {"craft": "shape"}}`)}
		}},
		{"empty catalog", `catalog.json lists no presets`, func(m fstest.MapFS) {
			m["catalog.json"] = &fstest.MapFile{Data: []byte(`{"presets": []}`)}
			delete(m, "presets/clarify.md")
			delete(m, "presets/bolder-copy.md")
		}},
		{"missing marker", `presets/clarify.md must end with "[doan:design-skill] end of preset clarify"`, func(m fstest.MapFS) {
			m["presets/clarify.md"] = &fstest.MapFile{Data: []byte(strings.TrimSuffix(body("clarify", "x"), "[doan:design-skill] end of preset clarify\n"))}
		}},
		{"marker for another id", `presets/clarify.md must end with "[doan:design-skill] end of preset clarify"`, func(m fstest.MapFS) {
			m["presets/clarify.md"] = &fstest.MapFile{Data: []byte(strings.Replace(body("clarify", "x"), "end of preset clarify", "end of preset polish", 1))}
		}},
		{"marker not last", `presets/clarify.md must end with "[doan:design-skill] end of preset clarify"`, func(m fstest.MapFS) {
			m["presets/clarify.md"] = &fstest.MapFile{Data: []byte(body("clarify", "x") + "trailing\n")}
		}},
		{"second marker", `presets/clarify.md must contain one marker`, func(m fstest.MapFS) {
			m["presets/clarify.md"] = &fstest.MapFile{Data: []byte(body("clarify", "[doan:design-skill] end of preset clarify\n"))}
		}},
		{"upstream placeholder", `presets/clarify.md keeps upstream placeholder "{{command_prefix}}"`, func(m fstest.MapFS) {
			m["presets/clarify.md"] = &fstest.MapFile{Data: []byte(body("clarify", "Hand off to `{{command_prefix}}impeccable polish`."))}
		}},
		{"skill base dir placeholder", `presets/clarify.md keeps upstream placeholder "<skill-base-dir>"`, func(m fstest.MapFS) {
			m["presets/clarify.md"] = &fstest.MapFile{Data: []byte(body("clarify", "Run `<skill-base-dir>/scripts/x`."))}
		}},
		{"relative markdown link", `presets/clarify.md keeps unresolved relative path "craft-floor.md"`, func(m fstest.MapFS) {
			m["presets/clarify.md"] = &fstest.MapFile{Data: []byte(body("clarify", "Read [craft-floor.md](craft-floor.md) first."))}
		}},
		{"reference-style relative link", `presets/clarify.md keeps unresolved relative path "./craft-floor.md"`, func(m fstest.MapFS) {
			m["presets/clarify.md"] = &fstest.MapFile{Data: []byte(body("clarify", "Read [shared guidance][floor].\n\n[floor]: ./craft-floor.md"))}
		}},
		{"reference-style link in angle brackets", `presets/clarify.md keeps unresolved relative path "craft-floor.md"`, func(m fstest.MapFS) {
			m["presets/clarify.md"] = &fstest.MapFile{Data: []byte(body("clarify", "Read [shared guidance][floor].\n\n  [Floor]: <craft-floor.md> \"Floor\""))}
		}},
		{"reference-style link with destination on the next line", `presets/clarify.md keeps unresolved relative path "craft-floor.md"`, func(m fstest.MapFS) {
			m["presets/clarify.md"] = &fstest.MapFile{Data: []byte(body("clarify", "Read [floor].\n\n[floor]:\n  craft-floor.md"))}
		}},
		{"trailing JSON after catalog", `catalog.json`, func(m fstest.MapFS) {
			m["catalog.json"] = &fstest.MapFile{Data: []byte(`{"presets": [` + entry("clarify") + `, ` + entry("bolder-copy") + `]} {"aliases": {"craft": "clarify"}}`)}
		}},
		{"upstream reference path", `presets/clarify.md keeps unresolved relative path "reference/new-work.md"`, func(m fstest.MapFS) {
			m["presets/clarify.md"] = &fstest.MapFile{Data: []byte(body("clarify", "Follow reference/new-work.md for new surfaces."))}
		}},
		{"missing notice", `notices/platform-design-skills-LICENSE is missing or empty`, func(m fstest.MapFS) { delete(m, "notices/platform-design-skills-LICENSE") }},
		{"empty notice", `notices/LICENSE is missing or empty`, func(m fstest.MapFS) { m["notices/LICENSE"] = &fstest.MapFile{Data: nil} }},
	}
	for _, id := range []string{"", "Clarify", "CLARIFY", "clarify-", "-clarify", "a--b", "clar1fy", "a_b", "clarify.md", "../clarify", "a/b"} {
		id := id
		cases = append(cases, struct {
			name, want string
			edit       func(fstest.MapFS)
		}{"id grammar " + id, `invalid preset id "` + id + `"`, func(m fstest.MapFS) {
			m["catalog.json"] = &fstest.MapFile{Data: []byte(`{"presets": [` + entry("clarify") + `, ` + entry("bolder-copy") + `, ` + entry(id) + `]}`)}
		}})
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			m := validFS()
			tc.edit(m)
			c, err := parse(m)
			if err == nil {
				t.Fatalf("accepted: %v", c.Presets())
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("error %q does not mention %q", err, tc.want)
			}
		})
	}
}

func TestEmbeddedCatalog(t *testing.T) {
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"context", "clarify"} {
		p, ok := c.Lookup(id)
		if !ok || p.ID != id || len(p.Sources) == 0 {
			t.Fatalf("lookup %s: %v %v", id, p, ok)
		}
		b, ok := c.Body(id, "dev")
		if !ok || !strings.HasSuffix(b, Marker(id, "dev")) {
			t.Fatalf("body %s lacks marker", id)
		}
	}
	// Later presets join the catalog; only the ones this batch wrote are pinned.
	if p, _ := c.Lookup("context"); p.Sources[0].Path != "skill/reference/init.md" {
		t.Fatalf("context must adapt upstream init first: %v", p.Sources)
	}
	for _, id := range []string{"", "init", "craft", "live", "overdrive", "optimize", "../clarify", "clarify.md", "a/b", "CLARIFY", "presets/clarify"} {
		if _, ok := c.Lookup(id); ok {
			t.Errorf("lookup accepted %q", id)
		}
		if _, ok := c.Body(id, "dev"); ok {
			t.Errorf("body accepted %q", id)
		}
	}
}

func TestPresetsReturnsCopy(t *testing.T) {
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	list := c.Presets()
	list[0].ID = "changed"
	list[0].Sources[0].Path = "changed"
	again := c.Presets()
	if again[0].ID == "changed" || again[0].Sources[0].Path == "changed" {
		t.Fatal("callers can mutate the catalog")
	}
}

func TestNoticesAreEmbedded(t *testing.T) {
	for _, name := range []string{"LICENSE", "NOTICE.md", "platform-design-skills-LICENSE", "MODIFICATIONS.md"} {
		embedded, err := files.ReadFile("notices/" + name)
		if err != nil {
			t.Fatal(err)
		}
		onDisk, err := os.ReadFile(filepath.Join("notices", name))
		if err != nil || string(embedded) != string(onDisk) || len(embedded) == 0 {
			t.Fatalf("notice %s not embedded as written", name)
		}
	}
	license, _ := files.ReadFile("notices/LICENSE")
	notice, _ := files.ReadFile("notices/NOTICE.md")
	mit, _ := files.ReadFile("notices/platform-design-skills-LICENSE")
	if !strings.Contains(string(license), "Apache License") || !strings.Contains(string(license), "Version 2.0, January 2004") {
		t.Error("LICENSE is not Apache-2.0")
	}
	if !strings.Contains(string(notice), "https://github.com/ehmo/platform-design-skills") {
		t.Error("NOTICE.md lost the ehmo attribution")
	}
	if !strings.Contains(string(mit), "MIT License") || !strings.Contains(string(mit), "dc2be825d8b439caea78e9eaa8fb3ac23b0ff3e9") {
		t.Error("platform-design-skills-LICENSE lacks the MIT text or its source commit")
	}
}

func TestMarkerDiffersFromGuideMarker(t *testing.T) {
	m := Marker("clarify", "1.0.0")
	if m != "[doan:design-skill] end of preset clarify v1.0.0\n" {
		t.Fatalf("marker %q", m)
	}
	// The doan skill guide ends with "[doan:skill] end of guide v<version>".
	if strings.Contains(m, "[doan:skill]") || strings.Contains(m, "end of guide") {
		t.Fatal("preset marker can be mistaken for the guide marker")
	}
}

// Shared fixtures (schema/fixtures/cli-envelope/design-skill) are example CLI outputs that the app's TypeScript tests read too.

const fixtureDir = "../../../schema/fixtures/cli-envelope/design-skill"

type fixtureCases struct {
	Version string `json:"version"`
	List    struct {
		File string `json:"file"`
	} `json:"list"`
	Get struct {
		File string `json:"file"`
		ID   string `json:"id"`
	} `json:"get"`
	Rejected []struct {
		File string   `json:"file"`
		IDs  []string `json:"ids"`
	} `json:"rejected"`
	Exit map[string]int `json:"exit"`
}

func readFixture(t *testing.T, name string, into any) {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(fixtureDir, name))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, into); err != nil {
		t.Fatalf("%s: %v", name, err)
	}
}

func envelopeFixture(t *testing.T, name string) map[string]any {
	t.Helper()
	var value map[string]any
	readFixture(t, name, &value)
	if err := formats.ValidateEnvelope(value); err != nil {
		t.Fatalf("%s is not a cli-envelope v1: %v", name, err)
	}
	return value
}

func row(p Preset) map[string]any {
	return map[string]any{"id": p.ID, "title": p.Title, "description": p.Description, "scope": p.Scope, "group": p.Group}
}

func TestFixturesMatchCatalog(t *testing.T) {
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	var cases fixtureCases
	readFixture(t, "cases.json", &cases)

	list := envelopeFixture(t, cases.List.File)["result"].(map[string]any)
	var rows []any
	for _, p := range c.Presets() {
		rows = append(rows, row(p))
	}
	if list["version"] != cases.Version || !reflect.DeepEqual(list["presets"], rows) || len(list) != 2 {
		t.Fatalf("%s differs from the catalog projection (id, title, description, scope, group in catalog order)", cases.List.File)
	}

	get := envelopeFixture(t, cases.Get.File)["result"].(map[string]any)
	p, ok := c.Lookup(cases.Get.ID)
	if !ok {
		t.Fatalf("fixture preset %q is not in the catalog", cases.Get.ID)
	}
	want, _ := c.Body(p.ID, cases.Version)
	var sources []any
	for _, s := range p.Sources {
		sources = append(sources, map[string]any{"repository": s.Repository, "commit": s.Commit, "path": s.Path})
	}
	if len(get) != 4 || get["version"] != cases.Version || !reflect.DeepEqual(get["preset"], row(p)) || !reflect.DeepEqual(get["sources"], sources) {
		t.Fatalf("%s differs from catalog entry %q", cases.Get.File, p.ID)
	}
	if get["body"] != want {
		t.Fatalf("%s body differs from Body(%q, %q); regenerate the fixture after editing the preset", cases.Get.File, p.ID, cases.Version)
	}

	referenced := map[string]bool{"cases.json": true, cases.List.File: true, cases.Get.File: true}
	for _, r := range cases.Rejected {
		referenced[r.File] = true
		failure := envelopeFixture(t, r.File)
		code := failure["error"].(map[string]any)["code"]
		if failure["ok"] != false || code != "usage_error" || cases.Exit["usage_error"] != 2 {
			t.Fatalf("%s must be a usage_error failure exiting 2", r.File)
		}
		if len(r.IDs) == 0 {
			t.Fatalf("%s names no rejected ids", r.File)
		}
		for _, id := range r.IDs {
			if _, ok := c.Lookup(id); ok {
				t.Errorf("%s: catalog accepts %q", r.File, id)
			}
		}
	}
	entries, err := os.ReadDir(fixtureDir)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if !referenced[e.Name()] {
			t.Errorf("%s is not described in cases.json", e.Name())
		}
	}
}

func TestSummaryIsTheListProjection(t *testing.T) {
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range c.Presets() {
		b, err := json.Marshal(p.Summary())
		if err != nil {
			t.Fatal(err)
		}
		var got map[string]any
		if err := json.Unmarshal(b, &got); err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(got, row(p)) {
			t.Fatalf("summary of %s carries more than id, title, description, scope and group: %s", p.ID, b)
		}
	}
}

func TestValidID(t *testing.T) {
	for _, id := range []string{"clarify", "bolder-copy", "context"} {
		if !ValidID(id) {
			t.Errorf("rejected %q", id)
		}
	}
	for _, id := range []string{"", "../clarify", "clarify.md", "a/b", "CLARIFY", "-clarify", "clarify-", "a--b", "a1"} {
		if ValidID(id) {
			t.Errorf("accepted %q", id)
		}
	}
}

// The upstream engine check from SOURCES.md. Go's regexp has no lookbehind, so the three exact source-notice tokens
// are blanked first and every remaining "impeccable" is caught, which matches the rg pattern there.
var (
	engineAllowed = []string{
		"pbakaus/impeccable at commit d34c87e1a00989ae8dbdd7f6b30b70f23319e860",
		"`skill/agents/impeccable-documenter.md`",
		"`skill/agents/impeccable-finish-reviewer.md`",
	}
	enginePattern = regexp.MustCompile(`(?i)impeccable|\{\{|\}\}|<skill-base-dir>|<!-- rule:|</?(codex|claude)>|CONTEXT_STALE|NO_PRODUCT_MD|IMAGE_GEN_AVAILABLE`)
)

func engineLeftovers(body string) []string {
	for _, token := range engineAllowed {
		body = strings.ReplaceAll(body, token, " ")
	}
	return enginePattern.FindAllString(body, -1)
}

func TestEngineCheckPattern(t *testing.T) {
	for _, text := range []string{
		"run `impeccable context` first",
		"{{command_prefix}}impeccable polish",
		"write .impeccable/design.json",
		"spawn impeccable-finish-reviewer",
		"`skill/agents/impeccable context`",
		"skill/agents/impeccable-documenter.md",
		"Adapted from Impeccable.",
		"pbakaus/impeccable at commit 0000000",
		"{{model}}", "}}", "<skill-base-dir>/x", "<!-- rule: r1 -->", "<codex>", "</CLAUDE>",
		"CONTEXT_STALE", "no_product_md", "IMAGE_GEN_AVAILABLE",
	} {
		if engineLeftovers(text) == nil {
			t.Errorf("missed %q", text)
		}
	}
	for _, text := range append(engineAllowed, "Source: pbakaus/impeccable at commit d34c87e1a00989ae8dbdd7f6b30b70f23319e860, `skill/agents/impeccable-finish-reviewer.md`.") {
		if got := engineLeftovers(text); got != nil {
			t.Errorf("flagged allowed %q: %v", text, got)
		}
	}
}

func TestPresetsKeepNoUpstreamEngine(t *testing.T) {
	entries, err := os.ReadDir("presets")
	if err != nil || len(entries) == 0 {
		t.Fatal(err)
	}
	for _, e := range entries {
		b, err := os.ReadFile(filepath.Join("presets", e.Name()))
		if err != nil {
			t.Fatal(err)
		}
		if got := engineLeftovers(string(b)); got != nil {
			t.Errorf("%s keeps upstream engine text: %q", e.Name(), got)
		}
	}
}

// Presets point to other presets through the shell CLI only.
func TestPresetsNameNoMCP(t *testing.T) {
	entries, err := os.ReadDir("presets")
	if err != nil || len(entries) == 0 {
		t.Fatal(err)
	}
	for _, e := range entries {
		b, err := os.ReadFile(filepath.Join("presets", e.Name()))
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(strings.ToLower(string(b)), "mcp") {
			t.Errorf("%s mentions MCP", e.Name())
		}
	}
}

func TestEmbeddedCatalogGroups(t *testing.T) {
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	type groupPresets struct {
		group string
		ids   []string
	}
	want := []groupPresets{
		{"start", []string{"context", "shape", "document", "extract"}},
		{"review", []string{"critique", "audit"}},
		{"refine", []string{"polish", "bolder", "quieter", "layout", "typeset", "colorize"}},
		{"content", []string{"distill", "clarify", "harden", "onboard"}},
		{"explore", []string{"adapt", "animate", "delight", "generate"}},
	}
	var got []groupPresets
	positions := map[string]int{}
	for _, p := range c.Presets() {
		i, seen := positions[p.Group]
		if !seen {
			i = len(got)
			positions[p.Group] = i
			got = append(got, groupPresets{group: p.Group})
		}
		got[i].ids = append(got[i].ids, p.ID)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("catalog group membership, first-appearance order and within-group order: got %v, want %v", got, want)
	}
}

// Design-system canvases live in .doan/ds/; .doan/canvases/design-system.html is only a legacy location.
// A preset that names the legacy file must name the new directory in the same sentence, so no reader
// takes the old single canvas as the place to look or write.
func TestPresetsFindDesignSystemInDsDirectory(t *testing.T) {
	entries, err := os.ReadDir("presets")
	if err != nil || len(entries) == 0 {
		t.Fatal(err)
	}
	for _, e := range entries {
		b, err := os.ReadFile(filepath.Join("presets", e.Name()))
		if err != nil {
			t.Fatal(err)
		}
		for i, l := range strings.Split(string(b), "\n") {
			if strings.Contains(l, "design-system.html") && !strings.Contains(l, "`.doan/ds/`") {
				t.Errorf("%s:%d names the legacy canvas without .doan/ds/: %q", e.Name(), i+1, l)
			}
		}
	}
}

// document defaults to one canvas per logical unit in .doan/ds/ and never mixes two units in one canvas.
func TestDocumentPresetSplitsDesignSystemByUnit(t *testing.T) {
	b, err := os.ReadFile(filepath.Join("presets", "document.md"))
	if err != nil {
		t.Fatal(err)
	}
	body := string(b)
	for _, s := range []string{"`.doan/ds/`", "one canvas per logical unit", "Never put two units in one canvas", "`.doan/ds/button.html`", "legacy `.doan/canvases/design-system.html`"} {
		if !strings.Contains(body, s) {
			t.Errorf("document preset is missing %q", s)
		}
	}
	if strings.Contains(body, "It lives at `.doan/canvases/design-system.html`") {
		t.Error("document preset still writes the single legacy canvas")
	}
}

// document skips only nonvisual wrappers: a wrapper with its own styling is a shared component and
// gets a canvas, and Verify checks every visual shared component against that narrow exception.
func TestDocumentPresetSkipsOnlyNonvisualWrappers(t *testing.T) {
	b, err := os.ReadFile(filepath.Join("presets", "document.md"))
	if err != nil {
		t.Fatal(err)
	}
	body := string(b)
	for _, s := range []string{
		"nonvisual infrastructure wrappers",
		"a tooltip content wrapper with a project class, is a shared component",
		"every visual shared component in the code has its own canvas",
		"listed with its reason",
	} {
		if !strings.Contains(body, s) {
			t.Errorf("document preset is missing %q", s)
		}
	}
	for _, s := range []string{"skip only utility and wrapper components", "on a canvas or listed as skipped"} {
		if strings.Contains(body, s) {
			t.Errorf("document preset still lets any wrapper be skipped: %q", s)
		}
	}
}

// T8 round 1: one session skipped a dialog several screens render because its classes appeared in that
// component only. Shared is decided by how many screens show a component, not by where its styles are used.
func TestDocumentPresetSharedMeansRenderedBySeveralScreens(t *testing.T) {
	body := documentPreset(t)
	for _, s := range []string{
		"a component, dialog, or surface seen on two or more screens is shared, even if its styles appear nowhere else",
		"parts of a single screen (seen on one screen only)",
		"each skip is a nonvisual wrapper or seen on one screen only",
	} {
		if !strings.Contains(body, s) {
			t.Errorf("document preset is missing %q", s)
		}
	}
	if strings.Contains(body, "each skip is a nonvisual wrapper or part of a single screen") {
		t.Error("document preset still leaves 'part of a single screen' undefined in Verify")
	}
}

// T8 round 1: one session drew an app shell whose tabs and groups the code no longer renders.
// A shared surface is drawn from the files that render it now.
func TestDocumentPresetDrawsSharedSurfacesFromCurrentCode(t *testing.T) {
	body := documentPreset(t)
	for _, s := range []string{
		"Draw it from the files that render it now (read them and name them in `data-doan-implements`), with the sections and controls they render today",
		"for a shared surface, the file that renders that frame",
		"Each shared surface shows the sections and controls the files that render it show today.",
	} {
		if !strings.Contains(body, s) {
			t.Errorf("document preset is missing %q", s)
		}
	}
	for _, s := range []string{"drawn from the components' markup", "the layout file for a shared surface"} {
		if strings.Contains(body, s) {
			t.Errorf("document preset still lets a shared surface be drawn without reading its current code: %q", s)
		}
	}
}

// T8 round 1: one session repeated the same two generic paragraphs on every canvas.
// A canvas carries only its own notes; notes for every canvas go once in the rules document.
func TestDocumentPresetKeepsSharedNotesOffCanvases(t *testing.T) {
	body := documentPreset(t)
	for _, s := range []string{
		"A canvas states only what is specific to it: what it draws that is not in code as shown, and its own open items.",
		"A note that applies to every canvas goes once in the rules document, not on each canvas.",
		"in the document and on the canvas it concerns",
		"No canvas repeats a note that applies to every canvas.",
	} {
		if !strings.Contains(body, s) {
			t.Errorf("document preset is missing %q", s)
		}
	}
	for _, s := range []string{"in the document and on the canvases,", "the same open items"} {
		if strings.Contains(body, s) {
			t.Errorf("document preset still asks every canvas to repeat shared open items: %q", s)
		}
	}
}

// T8 round 2: one session drew two icons from memory that differ from the installed icon package
// and did not say so on those canvases.
func TestDocumentPresetCopiesIconsFromInstalledPackage(t *testing.T) {
	body := documentPreset(t)
	for _, s := range []string{
		"copy its SVG markup from the icon package the project installs, not from memory",
		"If that package is not installed, state on the canvas that the icon is drawn from memory.",
	} {
		if !strings.Contains(body, s) {
			t.Errorf("document preset is missing %q", s)
		}
	}
}

// T8 round 2: one session shipped an app shell canvas whose layout overflowed its frame and overlapped,
// because it never looked at the rendered canvas.
func TestDocumentPresetLooksAtRenderedCanvases(t *testing.T) {
	body := documentPreset(t)
	for _, s := range []string{
		"Before finishing, look at each canvas rendered (in Doan, or a browser if Doan is not available) and fix overlapping or overflowing content",
		"Say which canvases you could not render.",
	} {
		if !strings.Contains(body, s) {
			t.Errorf("document preset is missing %q", s)
		}
	}
}

// T8 round 3: one session copied the whole app stylesheet into assets, a copy that silently goes stale
// when the code changes. A stylesheet outside the served scope is restated only as far as the canvas needs.
func TestDocumentPresetRestatesOnlyNeededRulesForUnservedStylesheets(t *testing.T) {
	body := documentPreset(t)
	for _, s := range []string{
		"restate on the canvas only the rules that canvas needs, with the same tokens",
		"Never copy a whole stylesheet into assets: the copy silently goes stale when the code changes.",
	} {
		if !strings.Contains(body, s) {
			t.Errorf("document preset is missing %q", s)
		}
	}
	if strings.Contains(body, "Do not copy token CSS or component CSS into assets unless you disclose it as a workaround.") {
		t.Error("document preset still allows copying a whole stylesheet as a disclosed workaround")
	}
}

// T8 round 3: one session drew a component several screens render only inside other canvases.
// A shared component keeps its own canvas however small it is and wherever else it appears.
func TestDocumentPresetGivesEverySharedComponentItsOwnCanvas(t *testing.T) {
	body := documentPreset(t)
	for _, s := range []string{
		"It keeps its own canvas even when it is small or other canvases also draw it.",
		"every visual shared component in the code has its own canvas",
	} {
		if !strings.Contains(body, s) {
			t.Errorf("document preset is missing %q", s)
		}
	}
	if strings.Contains(body, "every visual shared component in the code is on a canvas") {
		t.Error("document preset still accepts a shared component drawn only inside another canvas")
	}
}

// T8 round 3: one session repeated the same explanation on every frame of a component canvas.
// A note shared by a canvas's frames is said once on that canvas.
func TestDocumentPresetSaysSharedFrameNotesOnce(t *testing.T) {
	body := documentPreset(t)
	for _, s := range []string{
		"Within a canvas, say a note its frames share once, at the top of the canvas, not on every frame.",
		"No frame repeats a note its canvas already states.",
	} {
		if !strings.Contains(body, s) {
			t.Errorf("document preset is missing %q", s)
		}
	}
}

// T8 round 4: one session skipped dialogs the app mounts once but opens from several screens, counting
// them as one screen's. Shared counts the screens where a person sees a unit, not where the code mounts it.
func TestDocumentPresetCountsScreensWherePeopleSeeAUnit(t *testing.T) {
	body := documentPreset(t)
	for _, s := range []string{
		"Shared counts the screens where a person sees a unit, not where the code mounts it:",
		"or the app mounts it once and opens it from several screens",
	} {
		if !strings.Contains(body, s) {
			t.Errorf("document preset is missing %q", s)
		}
	}
	for _, s := range []string{"two or more screens render is shared", "rendered by one screen only"} {
		if strings.Contains(body, s) {
			t.Errorf("document preset still counts where the code renders a unit: %q", s)
		}
	}
}

// T8 round 4: one session drew only the first step of a screen that has several.
// A unit with steps or phases draws each one, as it draws states.
func TestDocumentPresetDrawsEveryStep(t *testing.T) {
	body := documentPreset(t)
	for _, s := range []string{
		"A unit with steps or phases draws each one, the same as its states.",
		"each unit with steps or phases shows every one",
	} {
		if !strings.Contains(body, s) {
			t.Errorf("document preset is missing %q", s)
		}
	}
}

func documentPreset(t *testing.T) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("presets", "document.md"))
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}
