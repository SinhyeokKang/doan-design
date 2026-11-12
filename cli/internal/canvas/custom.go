package canvas

// CustomText is what one style text does with custom properties.
type CustomText struct {
	Uses CustomUse
	// URLs holds the url()s that custom property values hold: the CSSRefs
	// whose Custom is set.
	URLs []CSSRef
}

// ScanCustom walks the declarations ScanCSS walks.
func ScanCustom(text string, mode Mode) CustomText {
	return CustomText{}
}

// CustomUsers records, over a canvas and the stylesheets it reaches, which
// folders' style text puts each custom property into a real property.
type CustomUsers struct{}

// Add records what the style text in folder dir does with custom properties.
func (u *CustomUsers) Add(dir string, c CustomUse) {}

// Consumers returns the folders whose var() puts name into a real property,
// directly or through other custom properties, sorted.
func (u *CustomUsers) Consumers(name string) []string { return nil }

// Registered reports whether an @property rule gives name a syntax that
// accepts <url>.
func (u *CustomUsers) Registered(name string) bool { return false }

// CustomURLPaths returns the repo paths a relative url() resolves to from
// each folder in dirs, sorted and unique.
func CustomURLPaths(dirs []string, href string) []string { return nil }

// Ambiguous reports whether the url() href held in custom property name
// resolves to two or more different repo paths from the folders that use it.
func (u *CustomUsers) Ambiguous(name, href string) bool { return false }
