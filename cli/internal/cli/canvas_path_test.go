package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// The CLI checks a canvas path before it asks the app, so its patterns must be the schema's: a narrower one refuses
// requests the app accepts, a wider one sends requests the app refuses as bad_request.
func TestCanvasPathPatternsMatchSchemas(t *testing.T) {
	for _, tt := range []struct {
		version int
		pattern *regexp.Regexp
	}{
		{3, workCanvasPath},
		{4, workCanvasPath},
		{5, handoffCanvasPath},
		{6, workCanvasPath},
		{8, handoffCanvasPath},
	} {
		t.Run(fmt.Sprintf("v%d", tt.version), func(t *testing.T) {
			data, err := os.ReadFile(filepath.Join("..", "..", "..", "schema", fmt.Sprintf("app-socket.v%d.schema.json", tt.version)))
			if err != nil {
				t.Fatal(err)
			}
			var schema struct {
				Defs struct {
					Request struct {
						Properties struct {
							Path struct {
								Pattern string `json:"pattern"`
							} `json:"path"`
						} `json:"properties"`
					} `json:"request"`
				} `json:"$defs"`
			}
			if err := json.Unmarshal(data, &schema); err != nil {
				t.Fatal(err)
			}
			if got := schema.Defs.Request.Properties.Path.Pattern; got == "" || got != tt.pattern.String() {
				t.Fatalf("schema path pattern %q, CLI pattern %q", got, tt.pattern.String())
			}
			seen := 0
			for _, kind := range []string{"valid", "invalid"} {
				dir := filepath.Join("..", "..", "..", "schema", "fixtures", fmt.Sprintf("app-socket-v%d", tt.version), "request", kind)
				entries, err := os.ReadDir(dir)
				if err != nil {
					t.Fatal(err)
				}
				for _, entry := range entries {
					if kind == "invalid" && !strings.HasPrefix(entry.Name(), "path-") {
						continue
					}
					data, err := os.ReadFile(filepath.Join(dir, entry.Name()))
					if err != nil {
						t.Fatal(err)
					}
					var request struct {
						Path *string `json:"path"`
					}
					if err := json.Unmarshal(data, &request); err != nil || request.Path == nil {
						continue
					}
					if got := tt.pattern.MatchString(*request.Path); got != (kind == "valid") {
						t.Errorf("%s/%s: path %q matched %v", kind, entry.Name(), *request.Path, got)
					}
					seen++
				}
			}
			if seen < 5 {
				t.Fatalf("only %d path fixtures", seen)
			}
		})
	}
}
