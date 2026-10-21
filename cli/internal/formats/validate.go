package formats

import (
	"bytes"
	"fmt"
	"sync"

	"github.com/SinhyeokKang/doan-design/schema"
	"github.com/santhosh-tekuri/jsonschema/v6"
)

var validators = sync.OnceValues(func() (map[string]*jsonschema.Schema, error) {
	compiler := jsonschema.NewCompiler()
	compiled := make(map[string]*jsonschema.Schema)
	for _, name := range []string{"comment-event", "config", "cli-envelope"} {
		filename := name + ".v1.schema.json"
		data, err := schema.Files.ReadFile(filename)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", filename, err)
		}
		document, err := jsonschema.UnmarshalJSON(bytes.NewReader(data))
		if err != nil {
			return nil, fmt.Errorf("parse %s: %w", filename, err)
		}
		if err := compiler.AddResource(filename, document); err != nil {
			return nil, fmt.Errorf("load %s: %w", filename, err)
		}
		validator, err := compiler.Compile(filename)
		if err != nil {
			return nil, fmt.Errorf("compile %s: %w", filename, err)
		}
		compiled[name] = validator
	}
	return compiled, nil
})

func validate(name string, value any) error {
	compiled, err := validators()
	if err != nil {
		return err
	}
	return compiled[name].Validate(value)
}

func ValidateCommentEvent(value any) error { return validate("comment-event", value) }
func ValidateConfig(value any) error       { return validate("config", value) }
func ValidateEnvelope(value any) error     { return validate("cli-envelope", value) }
