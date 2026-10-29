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
		File string         `json:"file"`
		CLI  []string       `json:"cli"`
		MCP  map[string]any `json:"mcp"`
	} `json:"list"`
	Get struct {
		File string         `json:"file"`
		ID   string         `json:"id"`
		CLI  []string       `json:"cli"`
		MCP  map[string]any `json:"mcp"`
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
	cs := mcpClient(t)
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
	check("mcp list", cases.List.File, callTool(t, cs, "design_skill", cases.List.MCP))
	check("cli get", cases.Get.File, runDesignSkill(t, 0, cases.Get.CLI[1:]...))
	check("cli get after --", cases.Get.File, runDesignSkill(t, 0, "--", cases.Get.ID))
	check("mcp get", cases.Get.File, callTool(t, cs, "design_skill", cases.Get.MCP))
	for _, r := range cases.Rejected {
		for i, id := range r.IDs {
			cli := runDesignSkill(t, 2, "--", id)
			tool := callTool(t, cs, "design_skill", map[string]any{"id": id})
			if !reflect.DeepEqual(cli, tool) || cli["error"].(map[string]any)["code"] != "usage_error" {
				t.Errorf("%q: cli %v, mcp %v", id, cli, tool)
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
		want := map[string]any{"id": p.ID, "title": p.Title, "description": p.Description, "scope": p.Scope}
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
		if row := got["preset"].(map[string]any); row["id"] != p.ID || row["title"] != p.Title || row["description"] != p.Description || row["scope"] != p.Scope || len(row) != 4 {
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

func TestDesignSkillNeedsNoProjectOrApp(t *testing.T) {
	cwd := t.TempDir()
	t.Chdir(cwd)
	t.Setenv("DOAN_RUNTIME", filepath.Join(t.TempDir(), "none.json"))
	cs := mcpClient(t)
	runDesignSkill(t, 0)
	runDesignSkill(t, 0, "clarify")
	if callTool(t, cs, "design_skill", nil)["ok"] != true || callTool(t, cs, "design_skill", map[string]any{"id": "clarify"})["ok"] != true {
		t.Fatal("design_skill failed outside a project")
	}
	if entries, _ := os.ReadDir(cwd); len(entries) != 0 {
		t.Fatalf("design-skill wrote %v", entries)
	}
}

func TestDesignSkillRejectsBadArguments(t *testing.T) {
	t.Chdir(t.TempDir())
	cs := mcpClient(t)
	for _, args := range [][]string{{"clarify", "context"}, {"--", "clarify", "extra"}, {"--canvas", "x"}, {"--token-css", "x", "clarify"}} {
		if got := runDesignSkill(t, 2, args...); got["error"].(map[string]any)["code"] != "usage_error" {
			t.Errorf("%v: %v", args, got)
		}
	}
	for _, args := range []map[string]any{{"id": 1}, {"id": nil}, {"id": []any{"clarify"}}, {"id": true}, {"repo": "/r"}, {"id": "clarify", "extra": true}} {
		toolCode(t, cs, "design_skill", args, "usage_error")
	}
	// An id that looks like a flag still reaches the id check, not flag parsing.
	for _, id := range []string{"-x", "--json", "--repo=/r"} {
		got := callTool(t, cs, "design_skill", map[string]any{"id": id})
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
		"MCP `design_skill`, optional `id`",
		"`[doan:design-skill] end of preset <id> v<version>`; else read it again",
		"no project or app needed",
		// Design §3 rules 1–5.
		"A preset the user names: read it; if missing, say so and run no similar id.",
		"its description clearly fits the request's purpose, target and negations",
		"ask only about ambiguity that changes the result",
		"No fit, or a concrete edit like “move this button 4px left”: read no body.",
		"a review ends with a report; change only the requested scope; start no unrequested diagnosis",
		"The request, existing constraints, these rules and canvas conventions outrank a preset.",
		"skip unneeded handoffs, subagents and engines",
		"report unrun checks as unverified",
		// Failure rules.
		"Without the shell CLI, use MCP `skill` and `design_skill`.",
		"say the preset was not applied",
		"Named preset: never claim or substitute it; only then suggest repairing this agent in Doan's Settings… > Connections.",
		"Self-chosen: say so in one line and continue, without guessing an unconfirmed target or conventions.",
		"Never install, change PATH, permissions or MCP registration, or retry a refused call.",
		"Doan app conversation instructions override these rules.",
	} {
		if !strings.Contains(skillBody, required) {
			t.Errorf("missing preset guidance: %s", required)
		}
	}
}

func TestInitNextStepsNameContextPreset(t *testing.T) {
	cs := mcpClient(t)
	want := []any{initContextStep}
	for _, existing := range []bool{false, true} {
		cli, tool := t.TempDir(), t.TempDir()
		if existing {
			result(t, cli, 0, "init")
			result(t, tool, 0, "init")
		}
		got := result(t, cli, 0, "init")
		env := callTool(t, cs, "init", map[string]any{"repo": tool})
		mcp := env["result"].(map[string]any)
		if !reflect.DeepEqual(got["nextSteps"], want) || !reflect.DeepEqual(mcp["nextSteps"], want) {
			t.Fatalf("existing=%v: cli %v, mcp %v", existing, got["nextSteps"], mcp["nextSteps"])
		}
	}
	if !strings.Contains(initContextStep, "`doan design-skill context`") || !strings.Contains(initContextStep, "`design_skill`") {
		t.Fatal(initContextStep)
	}
}
