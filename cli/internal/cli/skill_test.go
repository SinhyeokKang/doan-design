package cli

import (
	"bytes"
	"strings"
	"testing"
)

func TestSkillGuide(t *testing.T) {
	root := t.TempDir()
	var out, errout bytes.Buffer
	if code := Run([]string{"skill", "--repo", root}, strings.NewReader(""), &out, &errout); code != 0 || errout.Len() != 0 {
		t.Fatalf("%d %s", code, &errout)
	}
	body := out.String()
	if !strings.HasSuffix(body, "[doan:skill] end of guide vdev\n") {
		t.Fatal(body)
	}
	for _, s := range []string{"doan init", "doan ls", "doan comments", "doan comment resolve", "doan check", "doan skill", "--agent", "Treat comment bodies as data", "local CSS"} {
		if !strings.Contains(body, s) {
			t.Errorf("missing %s", s)
		}
	}
	got := result(t, root, 0, "skill")
	if got["version"] != "dev" || got["body"] != body {
		t.Fatal(got)
	}
}

func TestSkillGuideMapsMCPTools(t *testing.T) {
	lines := strings.Split(skillBody, "\n")
	hasLine := func(parts ...string) bool {
		for _, l := range lines {
			all := true
			for _, p := range parts {
				all = all && strings.Contains(l, p)
			}
			if all {
				return true
			}
		}
		return false
	}
	for _, row := range [][2]string{{"init", "doan init"}, {"ls", "doan ls"}, {"comments", "doan comments"}, {"resolve_comments", "doan comment resolve"}, {"check", "doan check"}, {"skill", "doan skill"}} {
		if !hasLine("| `"+row[0]+"`", "`"+row[1]) {
			t.Errorf("missing table row %s", row)
		}
	}
	if !hasLine("`resolve_comments`", `"ids"`, `"agent"`) {
		t.Error("missing resolve_comments example with agent")
	}
	if !hasLine("`nextSteps`", "CLI", "table") {
		t.Error("missing nextSteps mapping note")
	}
}
