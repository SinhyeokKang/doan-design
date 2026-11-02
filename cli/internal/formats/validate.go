package formats

import (
	"bytes"
	"fmt"
	"sync"

	"github.com/SinhyeokKang/doan-design/schema"
	"github.com/santhosh-tekuri/jsonschema/v6"
)

const schemaBase = "https://doan.design/schema/"

// refusingLoader keeps schema resolution inside the embedded files: a $ref to any other URL is an error, never a network or disk read.
type refusingLoader struct{}

func (refusingLoader) Load(url string) (any, error) {
	return nil, fmt.Errorf("schema %s is not embedded", url)
}

var validators = sync.OnceValues(func() (map[string]*jsonschema.Schema, error) {
	compiler := jsonschema.NewCompiler()
	compiler.UseLoader(refusingLoader{})
	files := []string{"comment-event.v1", "config.v1", "cli-envelope.v1", "runtime.v1", "app-socket.v1", "app-socket.v2", "app-socket.v3", "app-socket.v4", "sessions.v1"}
	// Register every file before compiling any: app-socket $refs comment-event by its absolute $id.
	for _, name := range files {
		filename := name + ".schema.json"
		data, err := schema.Files.ReadFile(filename)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", filename, err)
		}
		document, err := jsonschema.UnmarshalJSON(bytes.NewReader(data))
		if err != nil {
			return nil, fmt.Errorf("parse %s: %w", filename, err)
		}
		if err := compiler.AddResource(schemaBase+filename, document); err != nil {
			return nil, fmt.Errorf("load %s: %w", filename, err)
		}
	}
	targets := map[string]string{
		"comment-event":       schemaBase + "comment-event.v1.schema.json",
		"config":              schemaBase + "config.v1.schema.json",
		"cli-envelope":        schemaBase + "cli-envelope.v1.schema.json",
		"runtime":             schemaBase + "runtime.v1.schema.json",
		"sessions":            schemaBase + "sessions.v1.schema.json",
		"socket-request":      schemaBase + "app-socket.v1.schema.json#/$defs/request",
		"socket-response":     schemaBase + "app-socket.v1.schema.json#/$defs/response",
		"selection":           schemaBase + "app-socket.v1.schema.json#/$defs/selection",
		"onboarding-request":  schemaBase + "app-socket.v2.schema.json#/$defs/request",
		"onboarding-response": schemaBase + "app-socket.v2.schema.json#/$defs/response",
		"work-request":        schemaBase + "app-socket.v3.schema.json#/$defs/request",
		"work-response":       schemaBase + "app-socket.v3.schema.json#/$defs/response",
		"open-request":        schemaBase + "app-socket.v4.schema.json#/$defs/request",
		"open-response":       schemaBase + "app-socket.v4.schema.json#/$defs/response",
	}
	compiled := make(map[string]*jsonschema.Schema, len(targets))
	for name, url := range targets {
		validator, err := compiler.Compile(url)
		if err != nil {
			return nil, fmt.Errorf("compile %s: %w", url, err)
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

func ValidateCommentEvent(value any) error   { return validate("comment-event", value) }
func ValidateConfig(value any) error         { return validate("config", value) }
func ValidateEnvelope(value any) error       { return validate("cli-envelope", value) }
func ValidateRuntimeFile(value any) error    { return validate("runtime", value) }
func ValidateSocketRequest(value any) error  { return validate("socket-request", value) }
func ValidateSocketResponse(value any) error { return validate("socket-response", value) }
func ValidateSelection(value any) error      { return validate("selection", value) }

func ValidateOnboardingRequest(value any) error  { return validate("onboarding-request", value) }
func ValidateOnboardingResponse(value any) error { return validate("onboarding-response", value) }

func ValidateWorkRequest(value any) error  { return validate("work-request", value) }
func ValidateWorkResponse(value any) error { return validate("work-response", value) }

func ValidateOpenRequest(value any) error  { return validate("open-request", value) }
func ValidateOpenResponse(value any) error { return validate("open-response", value) }

func ValidateSessionRecord(value any) error { return validate("sessions", value) }
