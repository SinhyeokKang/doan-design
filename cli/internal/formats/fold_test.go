package formats

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestFoldFixtures(t *testing.T) {
	directory := filepath.Join("..", "..", "..", "schema", "fixtures", "fold")
	entries, err := os.ReadDir(directory)
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		count++
		t.Run(entry.Name(), func(t *testing.T) {
			input, err := os.ReadFile(filepath.Join(directory, entry.Name(), "events.jsonl"))
			if err != nil {
				t.Fatal(err)
			}
			expectedJSON, err := os.ReadFile(filepath.Join(directory, entry.Name(), "expected.json"))
			if err != nil {
				t.Fatal(err)
			}
			var expected any
			if err := json.Unmarshal(expectedJSON, &expected); err != nil {
				t.Fatal(err)
			}
			actualJSON, err := json.Marshal(FoldText(string(input)))
			if err != nil {
				t.Fatal(err)
			}
			var actual any
			if err := json.Unmarshal(actualJSON, &actual); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(actual, expected) {
				t.Errorf("fold result = %s\nwant = %s", actualJSON, expectedJSON)
			}
		})
	}
	if count == 0 {
		t.Fatal("no fold fixtures")
	}
}

func TestUnionMergeInputConformsToSchema(t *testing.T) {
	path := filepath.Join("..", "..", "..", "schema", "fixtures", "fold", "union-merge", "events.jsonl")
	input, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSuffix(string(input), "\n"), "\n")
	if len(lines) != 5 {
		t.Fatalf("got %d lines, want 5", len(lines))
	}
	for i, line := range lines {
		var value any
		if err := json.Unmarshal([]byte(line), &value); err != nil {
			t.Fatal(err)
		}
		if err := ValidateCommentEvent(value); err != nil {
			t.Fatalf("line %d: %v", i+1, err)
		}
	}
}

func TestIdenticalDuplicatesRetainSmallestLine(t *testing.T) {
	input, err := os.ReadFile(filepath.Join("..", "..", "..", "schema", "fixtures", "fold", "duplicate-agent-edit", "events.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	parsed := ParseLines(string(input))
	if len(parsed.Warnings) != 0 {
		t.Fatalf("parse warnings: %v", parsed.Warnings)
	}
	for i, j := 0, len(parsed.Events)-1; i < j; i, j = i+1, j-1 {
		parsed.Events[i], parsed.Events[j] = parsed.Events[j], parsed.Events[i]
	}
	event := "evt_00000000-0000-4000-8000-000000000002"
	comment := "cmt_00000000-0000-4000-8000-000000000001"
	want := []Warning{{Code: "agent_not_allowed", Line: 2, Event: &event, Comment: &comment}}
	got := Fold(parsed.Events).Warnings
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("warnings = %#v; want %#v", got, want)
	}
}
