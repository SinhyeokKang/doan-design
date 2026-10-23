package formats

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestValidationFixtures(t *testing.T) {
	groups := []struct {
		name     string
		validate func(any) error
	}{
		{"comment-event", ValidateCommentEvent},
		{"config", ValidateConfig},
		{"cli-envelope", ValidateEnvelope},
		{"runtime", ValidateRuntimeFile},
		{"app-socket/request", ValidateSocketRequest},
		{"app-socket/response", ValidateSocketResponse},
		{"app-socket/selection", ValidateSelection},
	}
	for _, group := range groups {
		for _, validity := range []string{"valid", "invalid"} {
			directory := filepath.Join("..", "..", "..", "schema", "fixtures", filepath.FromSlash(group.name), validity)
			files, err := filepath.Glob(filepath.Join(directory, "*.json"))
			if err != nil {
				t.Fatal(err)
			}
			if len(files) == 0 {
				t.Fatalf("no fixtures in %s", directory)
			}
			for _, file := range files {
				t.Run(group.name+"/"+validity+"/"+filepath.Base(file), func(t *testing.T) {
					data, err := os.ReadFile(file)
					if err != nil {
						t.Fatal(err)
					}
					var value any
					if err := json.Unmarshal(data, &value); err != nil {
						t.Fatal(err)
					}
					err = group.validate(value)
					if (err == nil) != (validity == "valid") {
						t.Fatalf("validation error = %v; want %s", err, validity)
					}
				})
			}
		}
	}
}
