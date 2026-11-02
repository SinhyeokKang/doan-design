package export

import (
	"reflect"
	"testing"
)

func TestSizeCheckAllowsExactlyTheLimit(t *testing.T) {
	if ok, largest := SizeCheck(MaxBytes, []Asset{{"a.png", 1}}); !ok || largest != nil {
		t.Fatalf("at the limit: ok %v largest %v", ok, largest)
	}
	if ok, _ := SizeCheck(MaxBytes+1, nil); ok {
		t.Fatal("one byte over the limit passed")
	}
	if MaxBytes != 50*1024*1024 {
		t.Fatalf("limit is %d, want 50 MiB", MaxBytes)
	}
}

func TestSizeCheckNamesTheFiveLargestAssetsLargestFirst(t *testing.T) {
	assets := []Asset{{"c", 30}, {"a", 10}, {"g", 70}, {"b", 30}, {"f", 60}, {"d", 40}, {"e", 50}}
	ok, largest := SizeCheck(MaxBytes+1, assets)
	if ok {
		t.Fatal("over the limit passed")
	}
	want := []Asset{{"g", 70}, {"f", 60}, {"e", 50}, {"d", 40}, {"b", 30}}
	if !reflect.DeepEqual(largest, want) {
		t.Fatalf("largest = %v, want %v (ties by path)", largest, want)
	}
	if assets[0].Path != "c" {
		t.Fatal("SizeCheck reordered its input")
	}
}

func TestSizeCheckWithFewAssetsOrNone(t *testing.T) {
	if _, largest := SizeCheck(MaxBytes+1, []Asset{{"a", 5}}); !reflect.DeepEqual(largest, []Asset{{"a", 5}}) {
		t.Fatalf("largest = %v", largest)
	}
	if _, largest := SizeCheck(MaxBytes+1, nil); len(largest) != 0 {
		t.Fatalf("largest = %v", largest)
	}
}

func TestFormatSize(t *testing.T) {
	for size, want := range map[int64]string{0: "0 B", 1023: "1023 B", 1024: "1.0 KiB", 1536: "1.5 KiB", 1 << 20: "1.0 MiB", 52428800: "50.0 MiB", 3 << 30: "3072.0 MiB"} {
		if got := FormatSize(size); got != want {
			t.Errorf("FormatSize(%d) = %q, want %q", size, got, want)
		}
	}
}
