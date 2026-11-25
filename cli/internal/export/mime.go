// Package export turns a canvas into one self-contained HTML file. It includes
// only files the app would serve: the serving scope is the security boundary.
package export

import (
	"path"
	"strings"
)

// mimeTypes must equal TYPES in app/src/main/serve/server.ts. app/src/main/exportViewer.test.ts parses this literal as
// text: keep one `".ext": "mime",` entry per line between the braces.
var mimeTypes = map[string]string{
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

// mimeType follows the server: the lowercased Node extname of the real path,
// where a dotfile without another dot has no extension.
func mimeType(p string) string {
	base := path.Base(p)
	i := strings.LastIndex(base, ".")
	if i <= 0 {
		return "application/octet-stream"
	}
	if t, ok := mimeTypes[strings.ToLower(base[i:])]; ok {
		return t
	}
	return "application/octet-stream"
}
