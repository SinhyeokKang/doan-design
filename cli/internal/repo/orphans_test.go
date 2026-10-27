package repo

import (
	"reflect"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/canvas"
)

func TestOrphanFiles(t *testing.T) {
	parse := func(path, head string) canvas.Canvas {
		c, err := canvas.Parse(path, []byte("<head>"+head+"</head>"))
		if err != nil {
			t.Fatal(err)
		}
		return c
	}
	canvases := []canvas.Canvas{
		parse("doan/a.html", `<meta name="doan:canvas" content="a">`),
		// Invalid and duplicated ids still own their comment file: check reports the id, and the orphan rule must not nudge an agent to delete comments.
		parse("doan/upper.html", `<meta name="doan:canvas" content="Upper">`),
		parse("doan/dup.html", `<meta name="doan:canvas" content="dup"><meta name="doan:canvas" content="other">`),
		parse("doan/twin.html", `<meta name="doan:canvas" content="a">`),
		parse("doan/none.html", ``),
		parse("doan/body.html", `</head><body><meta name="doan:canvas" content="body">`),
	}
	files := []CommentFile{
		{ID: "a", Path: ".doan/comments/a.jsonl"},
		{ID: "body", Path: ".doan/comments/body.jsonl"},
		{ID: "dup", Path: ".doan/comments/dup.jsonl"},
		{ID: "gone", Path: ".doan/comments/gone.jsonl"},
		{ID: "other", Path: ".doan/comments/other.jsonl"},
		{ID: "upper", Path: ".doan/comments/upper.jsonl"},
		{ID: "Upper", Path: ".doan/comments/Upper.jsonl"},
	}
	want := []CommentFile{
		{ID: "body", Path: ".doan/comments/body.jsonl"},
		{ID: "gone", Path: ".doan/comments/gone.jsonl"},
		{ID: "other", Path: ".doan/comments/other.jsonl"},
		{ID: "upper", Path: ".doan/comments/upper.jsonl"},
	}
	if got := OrphanFiles(canvases, files); !reflect.DeepEqual(got, want) {
		t.Fatalf("%v", got)
	}
	if got := OrphanFiles(canvases, []CommentFile{}); !reflect.DeepEqual(got, []CommentFile{}) {
		t.Fatalf("empty: %v", got)
	}
}
