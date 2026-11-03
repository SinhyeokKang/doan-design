package export

import (
	"fmt"
	"sort"
)

// SizeCheck reports whether the final page of size bytes is within MaxBytes (Inline checks the rewritten canvas only,
// and the shell and the srcdoc escape make the page larger). When it
// is not, largest names the five biggest files it includes, largest first
// (equal sizes by path), so the caller can say what to shrink. assets is not
// reordered.
func SizeCheck(size int64, assets []Asset) (ok bool, largest []Asset) {
	if size <= MaxBytes {
		return true, nil
	}
	return false, Largest(assets)
}

// Largest returns the five biggest assets, largest first, equal sizes by path.
func Largest(assets []Asset) []Asset {
	sorted := append([]Asset(nil), assets...)
	sort.Slice(sorted, func(i, j int) bool {
		if sorted[i].Size != sorted[j].Size {
			return sorted[i].Size > sorted[j].Size
		}
		return sorted[i].Path < sorted[j].Path
	})
	if len(sorted) > 5 {
		sorted = sorted[:5]
	}
	return sorted
}

// FormatSize writes a byte count for a person: bytes, then KiB or MiB with one decimal.
func FormatSize(size int64) string {
	switch {
	case size < 1024:
		return fmt.Sprintf("%d B", size)
	case size < 1024*1024:
		return fmt.Sprintf("%.1f KiB", float64(size)/1024)
	}
	return fmt.Sprintf("%.1f MiB", float64(size)/(1024*1024))
}
