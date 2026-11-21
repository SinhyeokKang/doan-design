package canvas

import (
	"path"
	"sort"
	"strings"
)

// CustomText is what one style text does with custom properties.
type CustomText struct {
	Uses CustomUse
	// URLs holds the url()s that custom property values hold: the CSSRefs
	// whose Custom is set.
	URLs []CSSRef
}

// ScanCustom walks the declarations ScanCSS walks.
func ScanCustom(text string, mode Mode) CustomText {
	t := CustomText{Uses: CustomUses(text, mode)}
	for _, r := range CSSRefs(text, mode) {
		if r.Custom != "" {
			t.URLs = append(t.URLs, r)
		}
	}
	return t
}

func (t *CustomText) merge(other CustomText) {
	for name := range other.Uses.Used {
		t.Uses.Used[name] = true
	}
	for from, names := range other.Uses.Hops {
		if t.Uses.Hops[from] == nil {
			t.Uses.Hops[from] = map[string]bool{}
		}
		for name := range names {
			t.Uses.Hops[from][name] = true
		}
	}
	for name := range other.Uses.URLSyntax {
		t.Uses.URLSyntax[name] = true
	}
	t.Uses.Editable = t.Uses.Editable || other.Uses.Editable
	for name, needs := range other.Uses.Needs {
		t.Uses.Needs[name] = append(t.Uses.Needs[name], needs...)
	}
	for from, names := range other.Uses.HopNeeds {
		if t.Uses.HopNeeds[from] == nil {
			t.Uses.HopNeeds[from] = map[string][][]string{}
		}
		for name, needs := range names {
			t.Uses.HopNeeds[from][name] = append(t.Uses.HopNeeds[from][name], needs...)
		}
	}
	t.URLs = append(t.URLs, other.URLs...)
}

// CustomUsers records, over a canvas and the stylesheets it reaches, which
// folders' style text puts each custom property into a real property.
// Chromium (measured in Electron 45) resolves a relative url() held in an
// unregistered custom property against the stylesheet whose var() does that,
// not where the property is declared. A rule counts only when Elements can
// match its rightmost compound selector: the app never applies a rule whose
// element the canvas lacks. Beyond that the record ignores selectors and the
// cascade, so it can list a folder whose rule never reaches an element that
// has the property; doan check and export both count that folder.
type CustomUsers struct {
	// Elements is the canvas's (canvas.Elements); nil counts every rule.
	Elements *Elements

	dirs      map[string]map[string][][]string // property → folder of a direct user → its rules' needs
	users     map[string]map[string][][]string // property → property whose value names it → needs
	urlSyntax map[string]bool
	// editable is set by a user-modify declaration in any style text, which
	// lets a person type new elements into the canvas without a script.
	editable bool
}

// Add records what the style text in folder dir does with custom properties.
// Which rules count is decided in Consumers, once every style text is in:
// a user-modify declaration in a later stylesheet makes every rule count.
func (u *CustomUsers) Add(dir string, c CustomUse) {
	if u.dirs == nil {
		u.dirs, u.users, u.urlSyntax = map[string]map[string][][]string{}, map[string]map[string][][]string{}, map[string]bool{}
	}
	u.editable = u.editable || c.Editable
	for name := range c.Used {
		if u.dirs[name] == nil {
			u.dirs[name] = map[string][][]string{}
		}
		u.dirs[name][dir] = append(u.dirs[name][dir], needsOr(c.Needs, name)...)
	}
	for from, names := range c.Hops {
		for name := range names {
			if u.users[name] == nil {
				u.users[name] = map[string][][]string{}
			}
			u.users[name][from] = append(u.users[name][from], needsOr(c.HopNeeds[from], name)...)
		}
	}
	for name := range c.URLSyntax {
		u.urlSyntax[name] = true
	}
}

// needsOr returns name's needs, or anyElement for a use recorded without
// them.
func needsOr(needs map[string][][]string, name string) [][]string {
	if n, ok := needs[name]; ok {
		return n
	}
	return anyElement
}

func (u *CustomUsers) applies(needs [][]string) bool {
	return u.editable || u.Elements.Match(needs)
}

// Consumers returns the folders whose var() puts name into a real property,
// directly or through other custom properties, sorted.
func (u *CustomUsers) Consumers(name string) []string {
	dirs := map[string]bool{}
	visited := map[string]bool{name: true}
	stack := []string{name}
	for len(stack) > 0 {
		n := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		for d, needs := range u.dirs[n] {
			if u.applies(needs) {
				dirs[d] = true
			}
		}
		for m, needs := range u.users[n] {
			if !visited[m] && u.applies(needs) {
				visited[m] = true
				stack = append(stack, m)
			}
		}
	}
	return sortedKeys(dirs)
}

// Registered reports whether an @property rule gives name a syntax that
// accepts <url>; the browser resolves such a url() where it is declared.
func (u *CustomUsers) Registered(name string) bool { return u.urlSyntax[name] }

// CustomURLPaths returns the repo paths a relative url() resolves to from
// each folder in dirs, sorted and unique. A leading "/", data:, external and
// empty URLs resolve the same from every folder and give none.
func CustomURLPaths(dirs []string, href string) []string {
	p, ok := LocalPath(href)
	if !ok || strings.HasPrefix(p, "/") || len(dirs) == 0 {
		return nil
	}
	paths := map[string]bool{}
	for _, d := range dirs {
		paths[path.Join(d, p)] = true
	}
	return sortedKeys(paths)
}

// Ambiguous reports whether the url() href held in custom property name
// resolves to two or more different repo paths from the folders that use it.
// The app then shows a different file for each user, which one exported
// data URL cannot, whether or not those files exist.
func (u *CustomUsers) Ambiguous(name, href string) bool {
	return !u.Registered(name) && len(CustomURLPaths(u.Consumers(name), href)) > 1
}

func sortedKeys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
