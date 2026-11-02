package cli

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"unicode/utf8"
)

// brandCandidate mirrors app/src/brand/candidates.ts: the product name in
// human-facing text, and whether a lowercase `doan` there is prose (written Doan)
// or a command, path or identifier that stays lowercase. Both read
// schema/fixtures/brand/cases.json.
type brandCandidate struct {
	Index int    `json:"index"`
	Form  string `json:"form"`
	Kind  string `json:"kind"`
}

var (
	brandWord = regexp.MustCompile(`\b(?:doan|Doan)\b`)
	// `doan` followed by a subcommand, a flag, a placeholder or a noun naming the command.
	brandCommandAfter = regexp.MustCompile(`^ (?:--?[a-z]|<|(?:active|check|comment|comments|config|design-skill|help|init|ls|onboarding|open|skill|version|work|CLI|command|server)(?:[^\w-]|$))`)
	brandIdentBefore  = regexp.MustCompile(`(?:\w\.|[-@]|named )$`)
	brandIdentAfter   = regexp.MustCompile(`^(?::|[-_]|\.\w)`)
	brandAppAfter     = regexp.MustCompile(`^\.app\b`)
)

const brandQuotes = "'\"‘’“”"

func brandKind(text string, start int, form string) string {
	before, after := text[:start], text[start+len(form):]
	switch {
	case strings.Count(before, "`")%2 == 1:
		return "command"
	case form == "doan" && text == form:
		return "identifier"
	case strings.HasSuffix(before, "/") || strings.HasSuffix(before, "~"):
		return "path"
	case brandIdentBefore.MatchString(before) || (brandIdentAfter.MatchString(after) && !brandAppAfter.MatchString(after)):
		return "identifier"
	case quotedBrand(before, after):
		return "identifier"
	case strings.HasSuffix(before, ".") || strings.HasPrefix(after, "/") || brandAppAfter.MatchString(after):
		return "path"
	case brandCommandAfter.MatchString(after):
		return "command"
	}
	return "prose"
}

func quotedBrand(before, after string) bool {
	if before == "" || after == "" || strings.HasPrefix(after, "’s") {
		return false
	}
	last, _ := utf8.DecodeLastRuneInString(before)
	first, _ := utf8.DecodeRuneInString(after)
	return strings.ContainsRune(brandQuotes, last) && strings.ContainsRune(brandQuotes, first)
}

// brandCandidates returns indexes in Unicode code points, as the shared fixture does.
func brandCandidates(text string) []brandCandidate {
	found := []brandCandidate{}
	for _, m := range brandWord.FindAllStringIndex(text, -1) {
		form := text[m[0]:m[1]]
		found = append(found, brandCandidate{Index: utf8.RuneCountInString(text[:m[0]]), Form: form, Kind: brandKind(text, m[0], form)})
	}
	return found
}

func proseDoan(text string) bool {
	for _, c := range brandCandidates(text) {
		if c.Form == "doan" && c.Kind == "prose" {
			return true
		}
	}
	return false
}

func TestBrandCandidatesMatchSharedFixtures(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "schema", "fixtures", "brand", "cases.json"))
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Cases []struct {
			Name     string           `json:"name"`
			Text     string           `json:"text"`
			Expected []brandCandidate `json:"expected"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	if len(fixture.Cases) == 0 {
		t.Fatal("no brand fixtures")
	}
	for _, c := range fixture.Cases {
		if got := brandCandidates(c.Text); !reflect.DeepEqual(got, c.Expected) {
			t.Errorf("%s: got %+v, want %+v", c.Name, got, c.Expected)
		}
	}
}

// Human-facing CLI text names the product Doan (doan-naming, 2026-10-30 user):
// messages, nextSteps and --help are string literals in cli/.
func TestCLIStringsNameTheProductDoan(t *testing.T) {
	root := filepath.Join("..", "..")
	var violations []string
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return err
		}
		fset := token.NewFileSet()
		file, err := parser.ParseFile(fset, path, nil, 0)
		if err != nil {
			return err
		}
		ast.Inspect(file, func(n ast.Node) bool {
			lit, ok := n.(*ast.BasicLit)
			if !ok || lit.Kind != token.STRING {
				return true
			}
			value, err := strconv.Unquote(lit.Value)
			if err == nil && proseDoan(value) {
				violations = append(violations, fmt.Sprintf("%s %q", fset.Position(lit.Pos()), value))
			}
			return true
		})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(violations) > 0 {
		t.Errorf("prose doan in CLI strings:\n%s", strings.Join(violations, "\n"))
	}
}

// The guide is checked as `doan skill` prints it, preset list included.
func TestSkillGuideNamesTheProductDoan(t *testing.T) {
	var out, errout strings.Builder
	if code := Run([]string{"skill", "--repo", t.TempDir()}, strings.NewReader(""), &out, &errout); code != 0 {
		t.Fatalf("doan skill exited %d: %s", code, errout.String())
	}
	var violations []string
	for i, line := range strings.Split(out.String(), "\n") {
		if proseDoan(line) {
			violations = append(violations, fmt.Sprintf("line %d: %s", i+1, line))
		}
	}
	if len(violations) > 0 {
		t.Errorf("prose doan in the guide:\n%s", strings.Join(violations, "\n"))
	}
}
