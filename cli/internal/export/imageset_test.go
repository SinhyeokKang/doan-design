package export

import (
	"bytes"
	"reflect"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/export/exporttest"
)

// A string argument of image-set() is a URL to the browser, so export inlines or refuses it like url().
func TestInlineImageSetStrings(t *testing.T) {
	root := exporttest.Seed(t)
	p := ".doan/canvases/image-set.html"
	exporttest.Put(t, root, p, `<!doctype html><html><head><style>.a{background-image:image-set("../assets/images/hero.png" 1x, '../assets/none.png' 2x)}</style></head>`+
		`<body><div style="background:-webkit-image-set('../assets/images/hero.png' 1x)"></div></body></html>`)
	res := inlineSeed(t, root, p)
	if want := []Refusal{{p, "../assets/none.png", ReasonMissing}}; !reflect.DeepEqual(res.Refused, want) {
		t.Fatalf("refused = %+v, want %+v", res.Refused, want)
	}
	hero := dataURI("image/png", exporttest.HeroPNG)
	if !bytes.Contains(res.HTML, []byte(`image-set(url("`+hero+`") 1x,`)) || !bytes.Contains(res.HTML, []byte(`-webkit-image-set(url(&quot;`+hero+`&quot;) 1x)`)) {
		t.Fatalf("hero not inlined in both:\n%s", res.HTML)
	}
	if bytes.Contains(res.HTML, []byte("assets/images/hero.png")) {
		t.Fatalf("relative path left in the export:\n%s", res.HTML)
	}
}
