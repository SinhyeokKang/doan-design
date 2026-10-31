package cli

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/designskill"
	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
)

// The shared examples the app's TypeScript tests read as well; their messages are part of what this command prints.
// The path is resolved once, before tests change the working directory.
var designSkillFixtures, _ = filepath.Abs("../../../schema/fixtures/cli-envelope/design-skill")

type designSkillCases struct {
	Version string `json:"version"`
	List    struct {
		File string   `json:"file"`
		CLI  []string `json:"cli"`
	} `json:"list"`
	Get struct {
		File string   `json:"file"`
		ID   string   `json:"id"`
		CLI  []string `json:"cli"`
	} `json:"get"`
	Rejected []struct {
		File string   `json:"file"`
		IDs  []string `json:"ids"`
	} `json:"rejected"`
}

func designSkillFixture(t *testing.T, name string, into any) {
	t.Helper()
	b, e := os.ReadFile(filepath.Join(designSkillFixtures, name))
	if e != nil {
		t.Fatal(e)
	}
	if e := json.Unmarshal(b, into); e != nil {
		t.Fatal(name, e)
	}
}

// runDesignSkill runs from the current directory, without --repo, the way an agent outside any project would.
func runDesignSkill(t *testing.T, want int, args ...string) map[string]any {
	t.Helper()
	var out, errout bytes.Buffer
	code := Run(append([]string{"design-skill", "--json"}, args...), strings.NewReader(""), &out, &errout)
	var v map[string]any
	if e := json.Unmarshal(out.Bytes(), &v); e != nil || errout.Len() != 0 || code != want {
		t.Fatalf("%v: exit %d want %d, %v, stdout %s stderr %s", args, code, want, e, &out, &errout)
	}
	if e := formats.ValidateEnvelope(v); e != nil {
		t.Fatal(e)
	}
	return v
}

func catalog(t *testing.T) *designskill.Catalog {
	t.Helper()
	c, e := designskill.Load()
	if e != nil {
		t.Fatal(e)
	}
	return c
}

func TestDesignSkillMatchesSharedFixtures(t *testing.T) {
	t.Chdir(t.TempDir())
	var cases designSkillCases
	designSkillFixture(t, "cases.json", &cases)
	if cases.Version != Version {
		t.Fatalf("fixtures were written by doan %s, tests run as %s", cases.Version, Version)
	}
	check := func(name, file string, got map[string]any) {
		t.Helper()
		var want map[string]any
		designSkillFixture(t, file, &want)
		if !reflect.DeepEqual(got, want) {
			t.Errorf("%s differs from %s:\n%v\n%v", name, file, got, want)
		}
	}
	check("cli list", cases.List.File, runDesignSkill(t, 0, cases.List.CLI[1:]...))
	check("cli get", cases.Get.File, runDesignSkill(t, 0, cases.Get.CLI[1:]...))
	check("cli get after --", cases.Get.File, runDesignSkill(t, 0, "--", cases.Get.ID))
	for _, r := range cases.Rejected {
		for i, id := range r.IDs {
			cli := runDesignSkill(t, 2, "--", id)
			if cli["error"].(map[string]any)["code"] != "usage_error" {
				t.Errorf("%q: %v", id, cli)
			}
			// The message names the rejected id, so only the first id of each file is the file's exact output.
			if i == 0 {
				check("rejected "+id, r.File, cli)
			}
		}
	}
}

func TestDesignSkillListIsCatalogProjection(t *testing.T) {
	t.Chdir(t.TempDir())
	got := runDesignSkill(t, 0)["result"].(map[string]any)
	if len(got) != 2 || got["version"] != Version {
		t.Fatal(got)
	}
	rows := got["presets"].([]any)
	presets := catalog(t).Presets()
	if len(rows) != len(presets) || len(rows) == 0 {
		t.Fatalf("%d rows for %d presets", len(rows), len(presets))
	}
	for i, p := range presets {
		want := map[string]any{"id": p.ID, "title": p.Title, "description": p.Description, "scope": p.Scope, "group": p.Group}
		if !reflect.DeepEqual(rows[i], want) {
			t.Errorf("row %d: %v, want %v (no body or sources, catalog order)", i, rows[i], want)
		}
	}
}

func TestDesignSkillReturnsEveryCompleteBody(t *testing.T) {
	t.Chdir(t.TempDir())
	c := catalog(t)
	for _, p := range c.Presets() {
		got := runDesignSkill(t, 0, p.ID)["result"].(map[string]any)
		body, _ := got["body"].(string)
		want, _ := c.Body(p.ID, Version)
		if len(got) != 4 || got["version"] != Version || body != want || !strings.HasSuffix(body, designskill.Marker(p.ID, Version)) || strings.Count(body, "[doan:design-skill]") != 1 {
			t.Fatalf("%s: incomplete result %v", p.ID, got)
		}
		if row := got["preset"].(map[string]any); row["id"] != p.ID || row["title"] != p.Title || row["description"] != p.Description || row["scope"] != p.Scope || row["group"] != p.Group || len(row) != 5 {
			t.Fatalf("%s: preset %v", p.ID, row)
		}
		var sources []designskill.Source
		b, _ := json.Marshal(got["sources"])
		if e := json.Unmarshal(b, &sources); e != nil || !reflect.DeepEqual(sources, p.Sources) {
			t.Fatalf("%s: sources %s", p.ID, b)
		}
		// Without --json the body is printed as is, so a reader can still check the end marker.
		var out, errout bytes.Buffer
		if code := Run([]string{"design-skill", p.ID}, strings.NewReader(""), &out, &errout); code != 0 || errout.Len() != 0 || out.String() != want {
			t.Fatalf("%s text: %d %q", p.ID, code, errout.String())
		}
	}
}

// Preset bodies reach the same tool as the guide, so they share its budget and derivation (skillOutputBudget).
// The app's CLI appends no bundle note to design-skill output.
func TestDesignSkillFitsToolOutputCap(t *testing.T) {
	t.Chdir(t.TempDir())
	args := [][]string{{"design-skill", "--json"}}
	for _, p := range catalog(t).Presets() {
		args = append(args, []string{"design-skill", p.ID, "--json"})
	}
	for _, a := range args {
		var out, errout bytes.Buffer
		if code := Run(a, strings.NewReader(""), &out, &errout); code != 0 {
			t.Fatalf("%v: %d %s", a, code, &errout)
		}
		if out.Len() > skillOutputBudget {
			t.Errorf("%v: %d bytes, budget %d", a, out.Len(), skillOutputBudget)
		}
	}
}

func TestDesignSkillNeedsNoProjectOrApp(t *testing.T) {
	cwd := t.TempDir()
	t.Chdir(cwd)
	t.Setenv("DOAN_RUNTIME", filepath.Join(t.TempDir(), "none.json"))
	runDesignSkill(t, 0)
	runDesignSkill(t, 0, "clarify")
	if entries, _ := os.ReadDir(cwd); len(entries) != 0 {
		t.Fatalf("design-skill wrote %v", entries)
	}
}

func TestDesignSkillRejectsBadArguments(t *testing.T) {
	t.Chdir(t.TempDir())
	for _, args := range [][]string{{"clarify", "context"}, {"--", "clarify", "extra"}, {"--canvas", "x"}, {"--token-css", "x", "clarify"}} {
		if got := runDesignSkill(t, 2, args...); got["error"].(map[string]any)["code"] != "usage_error" {
			t.Errorf("%v: %v", args, got)
		}
	}
	// An id after `--` that looks like a flag still reaches the id check, not flag parsing.
	for _, id := range []string{"-x", "--json", "--repo=/r"} {
		got := runDesignSkill(t, 2, "--", id)
		if got["error"].(map[string]any)["message"] != `invalid design preset id "`+id+`"` {
			t.Errorf("%q: %v", id, got)
		}
	}
}

func TestDesignSkillCatalogFailureIsInternal(t *testing.T) {
	t.Chdir(t.TempDir())
	saved := loadCatalog
	loadCatalog = func() (*designskill.Catalog, error) { return nil, errors.New("catalog.json lists no presets") }
	t.Cleanup(func() { loadCatalog = saved })
	for _, args := range [][]string{{"design-skill"}, {"design-skill", "clarify"}, {"skill"}} {
		var out, errout bytes.Buffer
		code := Run(append(args, "--json"), strings.NewReader(""), &out, &errout)
		var v map[string]any
		json.Unmarshal(out.Bytes(), &v)
		if code != 1 || v["ok"] != false || v["error"].(map[string]any)["code"] != "internal_error" {
			t.Errorf("%v: %d %s", args, code, &out)
		}
	}
}

func TestDesignSkillInHelp(t *testing.T) {
	if !strings.Contains(usage, "\n  design-skill [<id>]\n") {
		t.Fatal(usage)
	}
	for _, args := range [][]string{{"help"}, {"design-skill", "--help"}} {
		var out, errout bytes.Buffer
		if code := Run(args, strings.NewReader(""), &out, &errout); code != 0 || !strings.Contains(out.String(), "design-skill [<id>]") {
			t.Errorf("%v: %d %s", args, code, &out)
		}
	}
}

func TestSkillGuideListsPresetsFromCatalog(t *testing.T) {
	t.Chdir(t.TempDir())
	body := result(t, t.TempDir(), 0, "skill")["body"].(string)
	if strings.Count(skillBody, presetListSlot) != 1 || strings.Contains(body, presetListSlot) {
		t.Fatal("the guide must have exactly one preset list slot, filled on output")
	}
	c := catalog(t)
	var ids []string
	for _, p := range c.Presets() {
		ids = append(ids, p.ID)
		if strings.Contains(skillBody, "`"+p.ID+"`") {
			t.Errorf("skill.md names %s instead of leaving the list to the catalog", p.ID)
		}
		// Descriptions and bodies are read on demand; the guide carries neither, to stay under tool-output caps.
		if strings.Contains(body, p.Description) {
			t.Errorf("guide includes the description of %s", p.ID)
		}
		full, _ := c.Body(p.ID, Version)
		for _, paragraph := range strings.Split(full, "\n\n")[1:3] {
			if strings.Contains(body, strings.TrimSpace(paragraph)) {
				t.Errorf("guide includes the body of %s", p.ID)
			}
		}
	}
	if line := "\nPreset ids: " + strings.Join(ids, ", ") + ".\n"; !strings.Contains(body, line) {
		t.Errorf("guide lacks %q", line)
	}
	if !strings.HasSuffix(body, "[doan:skill] end of guide v"+Version+"\n") {
		t.Fatal("guide marker moved")
	}
}

func TestSkillGuidePresetRules(t *testing.T) {
	for _, required := range []string{
		"`doan design-skill --json` lists descriptions",
		"`doan design-skill <id> --json` returns a `body`",
		"`[doan:design-skill] end of preset <id> v<version>`, with no truncation notice; else read it again, in parts if truncated",
		"no project or app needed",
		// Design §3 rules 1–5.
		"A preset the user names: read it; if missing, say so and run no similar id.",
		"its description clearly fits the request's purpose, target and negations",
		"ask only about ambiguity that changes the result",
		"No fit, or a concrete edit like “move this button 4px left”: read no body.",
		// U-018: updating a design-system reference after a code change was taken as a concrete edit.
		"Creating or updating a design-system reference (`.doan/ds/` canvases or a rules document) is not a concrete edit: list descriptions first.",
		"a review ends with a report; change only the requested scope; start no unrequested diagnosis",
		"The request, existing constraints, these rules and canvas conventions outrank a preset.",
		"skip unneeded handoffs, subagents and engines",
		"report unrun checks as unverified",
		// Failure rules.
		"If `doan design-skill` fails or a read is refused, say the preset was not applied.",
		"Named preset: never claim or substitute it; then ask the user to open Doan from Applications and check Settings… > About.",
		"Self-chosen: say so in one line and continue, without guessing an unconfirmed target or conventions.",
		"Never install, change PATH or permissions, or retry a refused call.",
		"Doan app conversation instructions override these rules.",
	} {
		if !strings.Contains(skillBody, required) {
			t.Errorf("missing preset guidance: %s", required)
		}
	}
}

func TestInitNextStepsNameContextPreset(t *testing.T) {
	want := []any{initContextStep}
	root := t.TempDir()
	for _, existing := range []bool{false, true} {
		if got := result(t, root, 0, "init"); !reflect.DeepEqual(got["nextSteps"], want) {
			t.Fatalf("existing=%v: %v", existing, got["nextSteps"])
		}
	}
	if !strings.Contains(initContextStep, "`doan design-skill context`") || strings.Contains(initContextStep, "MCP") {
		t.Fatal(initContextStep)
	}
}
