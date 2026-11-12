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
	t.URLs = append(t.URLs, other.URLs...)
}

// CustomUsers records, over a canvas and the stylesheets it reaches, which
// folders' style text puts each custom property into a real property.
// Chromium (measured in Electron 45) resolves a relative url() held in an
// unregistered custom property against the stylesheet whose var() does that,
// not where the property is declared. The record is by name only, ignoring
// selectors and the cascade, so it can list a folder whose rule never applies
// to the element; doan check and export both count that folder.
type CustomUsers struct {
	dirs      map[string]map[string]bool // property → folders of its direct users
	users     map[string]map[string]bool // property → properties whose values name it
	urlSyntax map[string]bool
}

// Add records what the style text in folder dir does with custom properties.
func (u *CustomUsers) Add(dir string, c CustomUse) {
	if u.dirs == nil {
		u.dirs, u.users, u.urlSyntax = map[string]map[string]bool{}, map[string]map[string]bool{}, map[string]bool{}
	}
	for name := range c.Used {
		if u.dirs[name] == nil {
			u.dirs[name] = map[string]bool{}
		}
		u.dirs[name][dir] = true
	}
	for from, names := range c.Hops {
		for name := range names {
			if u.users[name] == nil {
				u.users[name] = map[string]bool{}
			}
			u.users[name][from] = true
		}
	}
	for name := range c.URLSyntax {
		u.urlSyntax[name] = true
	}
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
		for d := range u.dirs[n] {
			dirs[d] = true
		}
		for m := range u.users[n] {
			if !visited[m] {
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
