package export

import "testing"

func TestClassifyRef(t *testing.T) {
	cases := []struct {
		kind refKind
		href string
		want refClass
	}{
		{kindAsset, "../assets/a.png", classInline},
		{kindAsset, "  ../assets/a.png?v=1#x ", classInline},
		{kindAsset, "/logo.png", classInline}, // resolution refuses it as outside
		{kindAsset, "", classIgnore},
		{kindAsset, " \t", classIgnore},
		{kindAsset, "#icon", classIgnore},
		{kindAsset, "?v=1", classIgnore},
		{kindAsset, "data:image/png;base64,AAAA", classIgnore},
		{kindAsset, "blob:null/1", classIgnore},
		{kindAsset, "javascript:void(0)", classIgnore},
		{kindAsset, "https://cdn.example.com/a.png", classExternal},
		{kindAsset, "HTTP://cdn.example.com/a.png", classExternal},
		{kindAsset, "//cdn.example.com/a.png", classExternal},
		{kindStylesheet, "../../styles/tokens.css", classInline},
		{kindStylesheet, "https://fonts.example.com/css", classExternal},
		{kindStylesheet, "data:text/css,a{}", classIgnore},
		{kindLink, "other.html#top", classLink},
		{kindLink, "/root.html", classLink},
		{kindLink, "#top", classIgnore},
		{kindLink, "https://example.com/", classIgnore},
		{kindLink, "//example.com/", classIgnore},
		{kindLink, "mailto:a@example.com", classIgnore},
		{kindLink, "", classIgnore},
		{kindFrame, "full.html", classRefuse},
		{kindFrame, "/full.html", classRefuse},
		{kindFrame, "https://example.com/embed", classExternal},
		{kindFrame, "about:blank", classIgnore},
		{kindFrame, "", classIgnore},
	}
	for _, c := range cases {
		if got := classifyRef(c.kind, c.href); got != c.want {
			t.Errorf("classifyRef(%v, %q) = %v, want %v", c.kind, c.href, got, c.want)
		}
	}
}
