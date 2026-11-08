package repo

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"syscall"
	"testing"

	"golang.org/x/text/unicode/norm"
)

// linearMatch is the per-segment rule of the original linear scan: an exact
// name wins; otherwise every name equal to part under NFC and Go's simple case
// folding is a candidate for the identity check, in ReadDir order.
func linearMatch(names []string, part string) (bool, []string) {
	for _, name := range names {
		if name == part {
			return true, nil
		}
	}
	var aliases []string
	for _, name := range names {
		if strings.EqualFold(norm.NFC.String(name), norm.NFC.String(part)) {
			aliases = append(aliases, name)
		}
	}
	return false, aliases
}

func TestDirIndexMatch(t *testing.T) {
	nfc, nfd := norm.NFC.String("한글.css"), norm.NFD.String("한글.css")
	for _, tt := range []struct {
		name    string
		names   []string
		part    string
		exact   bool
		aliases []string
	}{
		{"exact name", []string{"a.png", "b.png"}, "a.png", true, nil},
		{"exact name wins over its case aliases", []string{"A.png", "a.png"}, "a.png", true, nil},
		{"letter case", []string{"Logo.PNG", "logo.png.bak"}, "logo.png", false, []string{"Logo.PNG"}},
		{"NFD on disk, NFC asked", []string{nfd}, nfc, false, []string{nfd}},
		{"NFC on disk, NFD asked", []string{nfc}, nfd, false, []string{nfc}},
		{"several names with one folded key keep ReadDir order", []string{"A.css", "B.css", "a.CSS", "b.css"}, "a.css", false, []string{"A.css", "a.CSS"}},
		{"no match", []string{"a.png"}, "b.png", false, nil},
		{"sharp s matches capital sharp s", []string{"ß"}, "ẞ", false, []string{"ß"}},
		{"capital sharp s matches sharp s", []string{"ẞ"}, "ß", false, []string{"ẞ"}},
		{"sharp s is not ss", []string{"SS", "ss"}, "ß", false, nil},
		{"capital sharp s is not SS", []string{"SS", "ss"}, "ẞ", false, nil},
		{"dotted capital I is not i or I", []string{"I", "i"}, "İ", false, nil},
		{"i and I are not dotted capital I", []string{"İ"}, "i", false, nil},
		{"I is not dotted capital I", []string{"İ"}, "I", false, nil},
		{"dotless i is not i or I", []string{"I", "i"}, "ı", false, nil},
		{"Kelvin sign matches k and K", []string{"K", "k"}, "K", false, []string{"K", "k"}},
		{"k matches the Kelvin sign", []string{"K"}, "k", false, []string{"K"}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if exact, aliases := linearMatch(tt.names, tt.part); exact != tt.exact || !reflect.DeepEqual(aliases, tt.aliases) {
				t.Fatalf("linear scan: %v %q; the table expects %v %q", exact, aliases, tt.exact, tt.aliases)
			}
			exact, aliases := indexNames(tt.names).match(tt.part)
			if exact != tt.exact || !reflect.DeepEqual(aliases, tt.aliases) {
				t.Fatalf("index: %v %q; want %v %q", exact, aliases, tt.exact, tt.aliases)
			}
		})
	}
}

// Every pair of names from runes with unusual folding orbits (long s, Kelvin
// sign, final sigma, dotted and dotless i, sharp s), canonical equivalents and
// invalid UTF-8 must give the linear scan's candidates in the same order.
func TestDirIndexMatchesLinearScan(t *testing.T) {
	alphabet := []string{"a", "A", "s", "S", "ſ", "ß", "ẞ", "k", "K", "K", "i", "I", "İ", "ı", "σ", "Σ", "ς", "가", "가", "é", "é", "\xff", "\xfe"}
	var all, names []string
	for i, a := range alphabet {
		for j, b := range alphabet {
			all = append(all, a+b)
			if (i+j)%3 != 0 {
				names = append(names, a+b)
			}
		}
	}
	slices.Sort(names)
	index := indexNames(names)
	for _, part := range all {
		wantExact, wantAliases := linearMatch(names, part)
		exact, aliases := index.match(part)
		if exact != wantExact || !reflect.DeepEqual(aliases, wantAliases) {
			t.Errorf("%q: %v %q; want %v %q", part, exact, aliases, wantExact, wantAliases)
		}
	}
}

func countingReadDir() (map[string]int, func(string) ([]os.DirEntry, error)) {
	reads := map[string]int{}
	return reads, func(dir string) ([]os.DirEntry, error) {
		reads[dir]++
		return os.ReadDir(dir)
	}
}

func readOnce(t *testing.T, reads map[string]int) {
	t.Helper()
	for dir, n := range reads {
		if n != 1 {
			t.Errorf("read %s %d times", dir, n)
		}
	}
}

func TestResolverAgreesWithResolveInEitherOrder(t *testing.T) {
	_, root, cases := resolveFixture(t)
	link(t, "loop", filepath.Join(root, "loop"))
	cases = append(cases, resolveCase{root, "loop", Missing, ""})
	for _, order := range []string{"forward", "reverse"} {
		t.Run(order, func(t *testing.T) {
			list := slices.Clone(cases)
			if order == "reverse" {
				slices.Reverse(list)
			}
			reads, readDir := countingReadDir()
			resolver := NewResolverWith(root, readDir)
			for _, tt := range list {
				state, rel, err := resolver.Resolve(tt.base, tt.p)
				if err != nil || state != tt.state || rel != tt.rel {
					t.Errorf("%s: %s %q %v; want %s %q", tt.p, state, rel, err, tt.state, tt.rel)
				}
			}
			readOnce(t, reads)
		})
	}
}

// The cases that diskSpelling decides by identity, all in one directory and
// one Resolver, so they share one index and one read of that directory.
func TestResolverSharesOneReadPerDirectory(t *testing.T) {
	root := real(t, t.TempDir())
	nfc, nfd := norm.NFC.String("한글.png"), norm.NFD.String("한글.png")
	hanNFC, hanNFD := norm.NFC.String("한.css"), norm.NFD.String("한.css")
	put(t, root, "assets/Logo.png", "logo")
	put(t, root, "assets/"+nfd, "hangul")
	put(t, root, "assets/"+hanNFD, "")
	if err := os.Link(filepath.Join(root, "assets", hanNFD), filepath.Join(root, "assets/a.css")); err != nil {
		t.Fatal(err)
	}
	link(t, "Logo.png", filepath.Join(root, "assets/link.png"))
	link(t, "assets", filepath.Join(root, "alias"))
	caseAliases := sameFile(t, filepath.Join(root, "assets/Logo.png"), filepath.Join(root, "assets/logo.png"))
	unicodeAliases := sameFile(t, filepath.Join(root, "assets", nfd), filepath.Join(root, "assets", nfc))
	if !caseAliases {
		put(t, root, "assets/Two.png", "upper")
		put(t, root, "assets/two.png", "lower")
	}
	ifAlias := func(alias bool, rel string) (State, string) {
		if alias {
			return Inside, rel
		}
		return Missing, ""
	}
	type want struct {
		p     string
		state State
		rel   string
	}
	cases := []want{
		{"assets/Logo.png", Inside, "assets/Logo.png"},
		{"assets/link.png", Inside, "assets/Logo.png"},
		{"alias/Logo.png", Inside, "assets/Logo.png"},
		{"alias/link.png", Inside, "assets/Logo.png"},
		{"assets/a.css", Inside, "assets/a.css"},
	}
	for _, p := range []string{"assets/logo.png", "ASSETS/LOGO.PNG", "alias/LOGO.png"} {
		state, rel := ifAlias(caseAliases, "assets/Logo.png")
		cases = append(cases, want{p, state, rel})
	}
	for _, p := range []string{"assets/" + nfc, "alias/" + nfc} {
		state, rel := ifAlias(unicodeAliases, "assets/"+nfd)
		cases = append(cases, want{p, state, rel})
	}
	// A hardlink that is no spelling of the name must not be chosen.
	state, rel := ifAlias(unicodeAliases, "assets/"+hanNFD)
	cases = append(cases, want{"assets/" + hanNFC, state, rel})
	if !caseAliases {
		cases = append(cases, want{"assets/Two.png", Inside, "assets/Two.png"}, want{"assets/two.png", Inside, "assets/two.png"}, want{"assets/TWO.png", Missing, ""})
	}
	reads, readDir := countingReadDir()
	resolver := NewResolverWith(root, readDir)
	for _, tt := range cases {
		state, rel, err := resolver.Resolve(root, tt.p)
		if err != nil || state != tt.state || rel != tt.rel {
			t.Errorf("%s: %s %q %v; want %s %q", tt.p, state, rel, err, tt.state, tt.rel)
		}
	}
	readOnce(t, reads)
	if reads[filepath.Join(root, "assets")] != 1 {
		t.Fatalf("assets read %d times: %v", reads[filepath.Join(root, "assets")], reads)
	}
}

func sameFile(t *testing.T, a, b string) bool {
	t.Helper()
	first, err := os.Lstat(a)
	if err != nil {
		t.Fatal(err)
	}
	second, err := os.Lstat(b)
	if os.IsNotExist(err) {
		return false
	} else if err != nil {
		t.Fatal(err)
	}
	return os.SameFile(first, second)
}

// One lexical path may name another real directory later in the same command:
// what the Resolver keeps must not carry an earlier answer over to it.
func TestResolverFollowsASwappedSymlink(t *testing.T) {
	parent := real(t, t.TempDir())
	root := filepath.Join(parent, "repo")
	for _, dir := range []string{filepath.Join(root, "first"), filepath.Join(root, "second"), filepath.Join(parent, "out")} {
		put(t, dir, "a.png", "")
		put(t, dir, "b.png", "")
	}
	swap := func(target string) {
		t.Helper()
		if err := os.Remove(filepath.Join(root, "link")); err != nil && !os.IsNotExist(err) {
			t.Fatal(err)
		}
		link(t, target, filepath.Join(root, "link"))
	}
	resolver := NewResolver(root)
	for _, step := range []struct {
		target, p string
		state     State
		rel       string
	}{
		{"first", "link/a.png", Inside, "first/a.png"},
		{"second", "link/a.png", Inside, "second/a.png"},
		{"second", "link/b.png", Inside, "second/b.png"},
		{filepath.Join(parent, "out"), "link/a.png", Outside, ""},
		{filepath.Join(parent, "out"), "link/b.png", Outside, ""},
		{"first", "link/b.png", Inside, "first/b.png"},
	} {
		swap(step.target)
		state, rel, err := resolver.Resolve(root, step.p)
		if err != nil || state != step.state || rel != step.rel {
			t.Fatalf("link → %s, %s: %s %q %v; want %s %q", step.target, step.p, state, rel, err, step.state, step.rel)
		}
	}
}

// The lexical check comes before any link resolution (also of the root), so a
// lexically outside path is Outside even when the root cannot be resolved.
func TestResolverChecksLexicallyFirst(t *testing.T) {
	root := filepath.Join(real(t, t.TempDir()), "missing")
	reads, readDir := countingReadDir()
	resolver := NewResolverWith(root, readDir)
	for _, tt := range []resolveCase{{root, "../x", Outside, ""}, {root, "x", Missing, ""}, {root, "/etc/hosts", Outside, ""}} {
		state, rel, err := resolver.Resolve(tt.base, tt.p)
		if err != nil || state != tt.state || rel != tt.rel {
			t.Errorf("%s: %s %q %v; want %s %q", tt.p, state, rel, err, tt.state, tt.rel)
		}
	}
	if len(reads) != 0 {
		t.Fatalf("read directories %v", reads)
	}
}

func TestResolverKeepsReadErrors(t *testing.T) {
	root := real(t, t.TempDir())
	put(t, root, "a/b.png", "")
	resolver := NewResolverWith(root, func(dir string) ([]os.DirEntry, error) {
		return nil, &os.PathError{Op: "open", Path: dir, Err: syscall.EACCES}
	})
	state, rel, err := resolver.Resolve(root, "a/b.png")
	if !errors.Is(err, syscall.EACCES) {
		t.Fatalf("%s %q %v; want EACCES", state, rel, err)
	}
}
