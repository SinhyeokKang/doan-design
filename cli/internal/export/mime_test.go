package export

import (
	"reflect"
	"testing"
)

// The whole table is pinned here; app/src/main/exportViewer.test.ts compares
// the same Go source with TYPES in app/src/main/serve/server.ts.
func TestMIMETableMatchesAppServer(t *testing.T) {
	want := map[string]string{
		".html":  "text/html; charset=utf-8",
		".css":   "text/css; charset=utf-8",
		".js":    "text/javascript; charset=utf-8",
		".mjs":   "text/javascript; charset=utf-8",
		".json":  "application/json; charset=utf-8",
		".txt":   "text/plain; charset=utf-8",
		".svg":   "image/svg+xml",
		".png":   "image/png",
		".jpg":   "image/jpeg",
		".jpeg":  "image/jpeg",
		".gif":   "image/gif",
		".webp":  "image/webp",
		".avif":  "image/avif",
		".ico":   "image/x-icon",
		".woff":  "font/woff",
		".woff2": "font/woff2",
		".ttf":   "font/ttf",
		".otf":   "font/otf",
	}
	if !reflect.DeepEqual(mimeTypes, want) {
		t.Fatalf("mimeTypes = %v", mimeTypes)
	}
}

func TestMIMETypeUsesTheServerExtensionRule(t *testing.T) {
	cases := map[string]string{
		".doan/assets/logo.PNG":       "image/png",
		".doan/assets/a.b/font.woff2": "font/woff2",
		"styles/tokens.css":           "text/css; charset=utf-8",
		".doan/assets/data.bin":       "application/octet-stream",
		".doan/assets/noext":          "application/octet-stream",
		// Node's extname gives "" for a dotfile without another dot.
		".doan/assets/.css":   "application/octet-stream",
		".doan/assets/.x.svg": "image/svg+xml",
	}
	for p, want := range cases {
		if got := mimeType(p); got != want {
			t.Errorf("mimeType(%q) = %q, want %q", p, got, want)
		}
	}
}
