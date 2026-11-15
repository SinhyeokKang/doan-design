package canvas

// Playable reports whether the frame id names a frame the prototype window can play. Unlike
// PrototypeTarget it refuses the empty id, which the window's frame list leaves out.
func Playable(c Canvas, id string) bool {
	if id == "" {
		return false
	}
	_, refusal := PrototypeTarget(c, id)
	return refusal == PrototypeOK
}

// LinkGroups returns the playable frames joined by data-doan-goto links, ignoring direction: each group
// lists its frame ids in document order, and the groups follow the document order of their first frame.
func LinkGroups(c Canvas) [][]string {
	var ids []string
	parent := map[string]string{}
	for _, f := range c.Frames {
		if Playable(c, f.ID) {
			ids = append(ids, f.ID)
			parent[f.ID] = f.ID
		}
	}
	var root func(string) string
	root = func(id string) string {
		if parent[id] != id {
			parent[id] = root(parent[id])
		}
		return parent[id]
	}
	for _, g := range c.Gotos {
		if _, ok := parent[g.Value]; !ok {
			continue
		}
		for _, from := range g.Frames {
			if _, ok := parent[from]; ok {
				parent[root(from)] = root(g.Value)
			}
		}
	}
	groups := [][]string{}
	index := map[string]int{}
	for _, id := range ids {
		r := root(id)
		i, ok := index[r]
		if !ok {
			i = len(groups)
			index[r] = i
			groups = append(groups, nil)
		}
		groups[i] = append(groups[i], id)
	}
	return groups
}
