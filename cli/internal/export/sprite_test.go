package export

import (
	"reflect"
	"strings"
	"testing"

	"github.com/SinhyeokKang/doan-design/cli/internal/export/exporttest"
)

const spritePrologue = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<!-- exported -->\n"

// RA1 🟡3: <use> cannot load a data: URL, so the sprite goes into the document.
func TestInlineSpritesForUse(t *testing.T) {
	root := exporttest.Seed(t)
	other := `<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="grad"/></defs><symbol id="star"><use href="#grad"/></symbol></svg>`
	exporttest.Put(t, root, ".doan/assets/other.svg", spritePrologue+other+"\n")
	exporttest.Put(t, root, ".doan/canvases/sprites.html", `<!doctype html><html><body>
<svg><use href="../assets/sprite.svg#icon"/><use xlink:href="../assets/sprite.svg#icon"></use><use href="../assets/other.svg#star"/><image href="../assets/images/dot.svg"/></svg>
<!-- </body> --><template></body></template>
</body></html>`)
	res := inlineSeed(t, root, ".doan/canvases/sprites.html")
	if len(res.Refused) != 0 {
		t.Fatalf("refused %+v", res.Refused)
	}
	want := `<!doctype html><html><body>
<svg><use href="#icon"/><use xlink:href="#icon"></use><use href="#star"/><image href="` + dataURI("image/svg+xml", []byte(exporttest.DotSVG)) + `"/></svg>
<!-- </body> --><template></body></template>
` + spriteContainer + exporttest.SpriteSVG + other + "\n</svg></body></html>"
	if string(res.HTML) != want {
		t.Errorf("html =\n%s\nwant\n%s", res.HTML, want)
	}
}

func TestInlineSpriteWithoutBody(t *testing.T) {
	root := exporttest.Seed(t)
	exporttest.Put(t, root, ".doan/canvases/nobody.html", `<svg><use href="../assets/sprite.svg#icon"/></svg>`)
	res := inlineSeed(t, root, ".doan/canvases/nobody.html")
	if want := `<svg><use href="#icon"/></svg>` + spriteContainer + exporttest.SpriteSVG + "</svg>"; string(res.HTML) != want {
		t.Errorf("html = %s", res.HTML)
	}
}

func TestInlineSpriteRefusals(t *testing.T) {
	root := exporttest.Seed(t)
	exporttest.Put(t, root, ".doan/assets/clash.svg", `<svg><symbol id="icon"/><symbol id="free"/></svg>`)
	exporttest.Put(t, root, ".doan/assets/canvas-clash.svg", `<svg><symbol id="hero"/></svg>`)
	exporttest.Put(t, root, ".doan/assets/page.html", `<p id="x"></p>`)
	exporttest.Put(t, root, ".doan/canvases/use-bad.html", `<section id="hero"><svg>
<use href="../assets/sprite.svg"/>
<use href="../assets/sprite.svg#"/>
<use href="../assets/sprite.svg#nope"/>
<use href="../assets/sprite.svg#icon"/>
<use href="../assets/clash.svg#free"/>
<use href="../assets/canvas-clash.svg#hero"/>
<use href="../assets/page.html#x"/>
<use href="../assets/none.svg#a"/>
<use href="../../src/secret.png#a"/>
</svg></section><template><p id="free"></p></template>`)
	res := inlineSeed(t, root, ".doan/canvases/use-bad.html")
	from := ".doan/canvases/use-bad.html"
	want := []Refusal{
		{from, "../assets/sprite.svg", ReasonUseFragment},
		{from, "../assets/sprite.svg#", ReasonUseFragment},
		{from, "../assets/sprite.svg#nope", ReasonUseID},
		{from, "../assets/clash.svg#free", ReasonUseCollision},
		{from, "../assets/canvas-clash.svg#hero", ReasonUseCollision},
		{from, "../assets/page.html#x", ReasonUseType},
		{from, "../assets/none.svg#a", ReasonMissing},
		{from, "../../src/secret.png#a", ReasonNotServed},
	}
	if !reflect.DeepEqual(res.Refused, want) {
		t.Errorf("refused =\n%+v\nwant\n%+v", res.Refused, want)
	}
	for _, r := range []string{ReasonOutside, ReasonNotServed, ReasonMissing, ReasonFrame, ReasonUseFragment, ReasonUseID, ReasonUseCollision, ReasonUseType} {
		if strings.Contains(r, ": ") {
			t.Errorf("reason %q contains \": \"", r)
		}
	}
}
