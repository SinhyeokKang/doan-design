package export

import (
	"encoding/base64"
	"os"
	"strings"
	"testing"

	nethtml "golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// The face the app window uses (app/src/renderer/fonts.css) and the license it ships with.
const appGeistDir = "../../../app/src/renderer/public/fonts/geist/"

func appGeist(t *testing.T) (woff2 []byte, license string) {
	t.Helper()
	woff2, err := os.ReadFile(appGeistDir + "Geist.woff2")
	if err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(appGeistDir + "LICENSE.txt")
	if err != nil {
		t.Fatal(err)
	}
	return woff2, string(b)
}

// fontStyles returns the text of every <style id="doan-font"> in page, as a browser parses it.
func fontStyles(t *testing.T, page []byte) []string {
	t.Helper()
	doc, err := nethtml.Parse(strings.NewReader(string(page)))
	if err != nil {
		t.Fatal(err)
	}
	var styles []string
	var visit func(*nethtml.Node)
	visit = func(n *nethtml.Node) {
		if n.Type == nethtml.ElementNode && n.DataAtom == atom.Style && attr(n, "id") == "doan-font" {
			text := ""
			if n.FirstChild != nil {
				text = n.FirstChild.Data
			}
			styles = append(styles, text)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			visit(c)
		}
	}
	visit(doc)
	return styles
}

// checkGeistFace holds the font style to the app's face: the woff2 as base64 under the app's @font-face values, and
// the license notice in a comment before it.
func checkGeistFace(t *testing.T, css string) {
	t.Helper()
	woff2, license := appGeist(t)
	src := `src: url(data:font/woff2;base64,` + base64.StdEncoding.EncodeToString(woff2) + `) format("woff2");`
	for _, want := range []string{`font-family: "Geist";`, src, "font-style: normal;", "font-weight: 100 900;"} {
		if !strings.Contains(css, want) {
			t.Fatalf("the font style lacks %.80q", want)
		}
	}
	at, face := strings.Index(css, license), strings.Index(css, "@font-face")
	if !strings.HasPrefix(css, "/*") || at < 0 || face < at || !strings.Contains(css[at+len(license):face], "*/") {
		t.Fatal("the license notice is not a comment before the @font-face")
	}
	if strings.Count(css, "*/") != 1 || strings.Contains(strings.ToLower(css), "</style") {
		t.Fatal("the font style could end its comment or its element early")
	}
}

// The CLI embeds a copy of the app's face, since go:embed cannot reach app/; the copy must stay the app's.
func TestGeistCopyIsTheApps(t *testing.T) {
	woff2, license := appGeist(t)
	got, err := viewerFS.ReadFile("viewer/Geist.woff2")
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(woff2) {
		t.Fatal("viewer/Geist.woff2 differs from the app's Geist.woff2")
	}
	notice, err := viewerFS.ReadFile("viewer/Geist-LICENSE.txt")
	if err != nil {
		t.Fatal(err)
	}
	if string(notice) != license {
		t.Fatal("viewer/Geist-LICENSE.txt differs from the app's LICENSE.txt")
	}
}

// The viewer's chrome draws in the app's face: one font style, and the face's bytes once in the whole file, so
// neither the prototype data in META nor the canvas carries another copy.
func TestAssembleEmbedsGeistOnce(t *testing.T) {
	page, _ := general(t, doc(flowBody))
	styles := fontStyles(t, page)
	if len(styles) != 1 {
		t.Fatalf("%d font styles, want 1", len(styles))
	}
	checkGeistFace(t, styles[0])
	woff2, _ := appGeist(t)
	if n := strings.Count(string(page), base64.StdEncoding.EncodeToString(woff2)); n != 1 {
		t.Fatalf("the face is in the viewer file %d times", n)
	}
	if strings.Contains(parseShell(t, page).srcdoc, "font/woff2;base64") {
		t.Fatal("the face went into the canvas")
	}
}

// The prototype file carries the same font style as the viewer file it can be written from.
func TestAssemblePrototypeEmbedsGeist(t *testing.T) {
	page, err := AssemblePrototype(Meta{Name: "board", Width: 1280}, checkout, []byte(simpleCanvas))
	if err != nil {
		t.Fatal(err)
	}
	styles := fontStyles(t, page)
	if len(styles) != 1 {
		t.Fatalf("%d font styles, want 1", len(styles))
	}
	checkGeistFace(t, styles[0])
	viewer, _ := general(t, doc(flowBody))
	if styles[0] != fontStyles(t, viewer)[0] {
		t.Fatal("the prototype file's font style differs from the viewer file's")
	}
}
