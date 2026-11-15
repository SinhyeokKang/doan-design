package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// schemaDefMaxLength reads $defs.<def>.maxLength from a shared schema, so a CLI limit kept as a Go constant
// cannot drift from the value the app validates against.
func schemaDefMaxLength(t *testing.T, file, def string) int {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "schema", file))
	if err != nil {
		t.Fatal(err)
	}
	var schema struct {
		Defs map[string]struct {
			MaxLength int `json:"maxLength"`
		} `json:"$defs"`
	}
	if err := json.Unmarshal(data, &schema); err != nil {
		t.Fatal(err)
	}
	got := schema.Defs[def].MaxLength
	if got == 0 {
		t.Fatalf("%s has no $defs.%s.maxLength", file, def)
	}
	return got
}

func TestOpenFrameMaxMatchesSchema(t *testing.T) {
	if got := schemaDefMaxLength(t, "app-socket.v4.schema.json", "frameId"); got != openFrameMax {
		t.Fatalf("schema frameId maxLength %d, openFrameMax %d", got, openFrameMax)
	}
}

func TestWorkNoteMaxMatchesSchema(t *testing.T) {
	if got := schemaDefMaxLength(t, "app-socket.v3.schema.json", "note"); got != workNoteMax {
		t.Fatalf("schema note maxLength %d, workNoteMax %d", got, workNoteMax)
	}
}
