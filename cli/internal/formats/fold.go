package formats

import (
	"encoding/json"
	"reflect"
	"sort"
	"strings"
)

func ParseLines(text string) ParseResult {
	result := ParseResult{Events: []LocatedEvent{}, Warnings: []Warning{}}
	for index, line := range strings.Split(text, "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		warning := Warning{Code: "invalid_event", Line: index + 1}
		var value any
		if err := json.Unmarshal([]byte(line), &value); err != nil {
			result.Warnings = append(result.Warnings, warning)
			continue
		}
		object, ok := value.(map[string]any)
		if !ok {
			result.Warnings = append(result.Warnings, warning)
			continue
		}
		if id, ok := object["id"].(string); ok {
			warning.Event = &id
		}
		if comment, ok := object["comment"].(string); ok {
			warning.Comment = &comment
		}
		version, ok := object["v"].(float64)
		if !ok {
			result.Warnings = append(result.Warnings, warning)
			continue
		}
		if version != 1 {
			warning.Code = "unknown_version"
			result.Warnings = append(result.Warnings, warning)
			continue
		}
		if err := ValidateCommentEvent(value); err != nil {
			result.Warnings = append(result.Warnings, warning)
			continue
		}

		// JSON Schema treats 1, 1.0 and 1e0 alike; Go's int decoder does not.
		normalized, err := json.Marshal(value)
		if err != nil {
			result.Warnings = append(result.Warnings, warning)
			continue
		}
		var event CommentEvent
		if err := json.Unmarshal(normalized, &event); err != nil {
			result.Warnings = append(result.Warnings, warning)
			continue
		}
		result.Events = append(result.Events, LocatedEvent{Line: index + 1, Event: event})
	}
	return result
}

func Fold(events []LocatedEvent) FoldResult {
	result := FoldResult{Comments: []Comment{}, Warnings: []Warning{}}
	first := make(map[string]LocatedEvent)
	conflicting := make(map[string]bool)
	for _, located := range events {
		previous, exists := first[located.Event.ID]
		if !exists {
			first[located.Event.ID] = located
		} else if !reflect.DeepEqual(previous.Event, located.Event) {
			conflicting[located.Event.ID] = true
		}
	}
	for _, located := range events {
		if conflicting[located.Event.ID] {
			result.Warnings = append(result.Warnings, eventWarning("conflicting_duplicate", located))
		}
	}
	ordered := make([]LocatedEvent, 0, len(first))
	for id, located := range first {
		if !conflicting[id] {
			ordered = append(ordered, located)
		}
	}
	sort.Slice(ordered, func(i, j int) bool {
		if ordered[i].Event.At != ordered[j].Event.At {
			return ordered[i].Event.At < ordered[j].Event.At
		}
		return ordered[i].Event.ID < ordered[j].Event.ID
	})

	comments := make(map[string]Comment)
	deleted := make(map[string]bool)
	for _, located := range ordered {
		event := located.Event
		if event.By.Kind == "agent" && event.Type != "resolve" {
			result.Warnings = append(result.Warnings, eventWarning("agent_not_allowed", located))
			continue
		}
		if deleted[event.Comment] {
			continue
		}
		comment, exists := comments[event.Comment]
		if event.Type == "create" && exists {
			result.Warnings = append(result.Warnings, eventWarning("duplicate_create", located))
			continue
		}
		if event.Type != "create" && !exists {
			result.Warnings = append(result.Warnings, eventWarning("orphan_event", located))
			continue
		}
		switch event.Type {
		case "create":
			comment = Comment{
				Comment: event.Comment, Status: "open", Body: event.Body,
				Target: *event.Target, CanvasHash: event.CanvasHash,
				CreatedBy: event.By, CreatedAt: event.At, UpdatedAt: event.At,
			}
		case "edit":
			comment.Body = event.Body
			comment.UpdatedAt = event.At
		case "resolve":
			if comment.Status == "open" {
				comment.Status = "resolved"
				comment.ResolvedBy = &event.By
				comment.ResolvedAt = &event.At
			}
		case "reopen":
			if comment.Status == "resolved" {
				comment.Status = "open"
				comment.ResolvedBy = nil
				comment.ResolvedAt = nil
			}
		case "delete":
			deleted[event.Comment] = true
			delete(comments, event.Comment)
			continue
		}
		comments[event.Comment] = comment
	}
	for _, comment := range comments {
		result.Comments = append(result.Comments, comment)
	}
	sort.Slice(result.Comments, func(i, j int) bool {
		if result.Comments[i].CreatedAt != result.Comments[j].CreatedAt {
			return result.Comments[i].CreatedAt < result.Comments[j].CreatedAt
		}
		return result.Comments[i].Comment < result.Comments[j].Comment
	})
	sort.Slice(result.Warnings, func(i, j int) bool {
		if result.Warnings[i].Line != result.Warnings[j].Line {
			return result.Warnings[i].Line < result.Warnings[j].Line
		}
		return result.Warnings[i].Code < result.Warnings[j].Code
	})
	return result
}

func eventWarning(code string, located LocatedEvent) Warning {
	return Warning{
		Code: code, Line: located.Line,
		Event: &located.Event.ID, Comment: &located.Event.Comment,
	}
}
