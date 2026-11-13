package canvas

import "unicode/utf16"

// PrototypeFrame is a frame a CLI command may play or export as a prototype.
type PrototypeFrame struct {
	ID    string
	Title *string
	// Size is the raw data-doan-prototype value, already valid.
	Size string
}

// PrototypeRefusal says why a frame id names no frame that can play.
type PrototypeRefusal int

const (
	PrototypeOK PrototypeRefusal = iota
	PrototypeMissing
	// PrototypeShared: more than one frame has the id, so which one would play is not defined.
	PrototypeShared
	// PrototypeTooLong: the app and the injected prototype script cap a frame id at 200 UTF-16 units, so no
	// window can play a longer one even when the file has it.
	PrototypeTooLong
	PrototypeNotMarked
)

// prototypeIDMax is in UTF-16 units, unlike the 200 code points of the socket schema's frameId.
const prototypeIDMax = 200

// PrototypeTarget judges a frame id statically against the parsed file, as convention 14 defines a frame: a
// frame a script adds later is not in the file and cannot be found here.
func PrototypeTarget(c Canvas, id string) (PrototypeFrame, PrototypeRefusal) {
	if len(utf16.Encode([]rune(id))) > prototypeIDMax {
		return PrototypeFrame{}, PrototypeTooLong
	}
	var found *Frame
	for i := range c.Frames {
		if c.Frames[i].ID != id {
			continue
		}
		if found != nil {
			return PrototypeFrame{}, PrototypeShared
		}
		found = &c.Frames[i]
	}
	if found == nil {
		return PrototypeFrame{}, PrototypeMissing
	}
	if found.Prototype == nil || !PrototypeSizeValid(*found.Prototype) {
		return PrototypeFrame{}, PrototypeNotMarked
	}
	return PrototypeFrame{ID: found.ID, Title: found.Title, Size: *found.Prototype}, PrototypeOK
}
