package repo

import (
	"bytes"
	"encoding/json"
	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
	"io"
)

type Config struct {
	V        int      `json:"v"`
	TokenCSS string   `json:"tokenCss,omitempty"`
	Serve    []string `json:"serve,omitempty"`
}

func ParseConfig(data []byte) (Config, string) {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return Config{}, "invalid_config"
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return Config{}, "invalid_config"
	}
	obj, ok := value.(map[string]any)
	if !ok {
		return Config{}, "invalid_config"
	}
	if n, ok := obj["v"].(json.Number); ok {
		v, err := n.Float64()
		if err != nil || v != 1 {
			return Config{}, "unsupported_version"
		}
		obj["v"] = v
	}
	if err := formats.ValidateConfig(value); err != nil {
		return Config{}, "invalid_config"
	}
	config := Config{V: 1, Serve: []string{}}
	if s, ok := obj["tokenCss"].(string); ok {
		config.TokenCSS = s
	}
	if paths, ok := obj["serve"].([]any); ok {
		for _, p := range paths {
			config.Serve = append(config.Serve, p.(string))
		}
	}
	return config, ""
}
