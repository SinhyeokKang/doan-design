package comments

import (
	"fmt"
	"io"
	"time"

	"github.com/SinhyeokKang/doan-design/cli/internal/formats"
)

const timestampLayout = "2006-01-02T15:04:05.000Z"

func MaxAt(parsed formats.ParseResult) (string, bool) {
	// Fixed-width UTC timestamps sort lexically in chronological order.
	var maximum string
	for _, located := range parsed.Events {
		if located.Event.At > maximum {
			maximum = located.Event.At
		}
	}
	return maximum, len(parsed.Events) > 0
}

func NextAt(maxAt string, ok bool, now time.Time) (string, error) {
	next := now.UTC().Truncate(time.Millisecond)
	if ok {
		previous, err := time.Parse(timestampLayout, maxAt)
		if err != nil {
			return "", fmt.Errorf("parse maximum event timestamp: %w", err)
		}
		minimum := previous.Add(time.Millisecond)
		if minimum.After(next) {
			next = minimum
		}
	}
	return next.Format(timestampLayout), nil
}

func NewResolve(comment, agent, at string, random io.Reader) (formats.CommentEvent, error) {
	var id [16]byte
	if _, err := io.ReadFull(random, id[:]); err != nil {
		return formats.CommentEvent{}, fmt.Errorf("read event UUID randomness: %w", err)
	}
	// RFC 9562 reserves these bits for UUIDv4 and its variant.
	id[6] = id[6]&0x0f | 0x40
	id[8] = id[8]&0x3f | 0x80
	return formats.CommentEvent{
		V:       1,
		ID:      fmt.Sprintf("evt_%x-%x-%x-%x-%x", id[0:4], id[4:6], id[6:8], id[8:10], id[10:16]),
		At:      at,
		Type:    "resolve",
		Comment: comment,
		By:      formats.Author{Kind: "agent", Name: agent},
	}, nil
}
