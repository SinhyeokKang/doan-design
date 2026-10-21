package formats

type Author struct {
	Kind  string  `json:"kind"`
	Name  string  `json:"name"`
	Email *string `json:"email,omitempty"`
}

type Element struct {
	DoanID    *string `json:"doanId,omitempty"`
	Selector  string  `json:"selector"`
	HTML      string  `json:"html"`
	Text      *string `json:"text,omitempty"`
	Truncated *bool   `json:"truncated,omitempty"`
}

type Target struct {
	Frame   *string  `json:"frame,omitempty"`
	Element *Element `json:"element,omitempty"`
}

type CommentEvent struct {
	V          int     `json:"v"`
	ID         string  `json:"id"`
	At         string  `json:"at"`
	Type       string  `json:"type"`
	Comment    string  `json:"comment"`
	By         Author  `json:"by"`
	Body       string  `json:"body,omitempty"`
	CanvasHash string  `json:"canvasHash,omitempty"`
	Target     *Target `json:"target,omitempty"`
}

type LocatedEvent struct {
	Line  int          `json:"line"`
	Event CommentEvent `json:"event"`
}

type Warning struct {
	Code    string  `json:"code"`
	Line    int     `json:"line"`
	Event   *string `json:"event,omitempty"`
	Comment *string `json:"comment,omitempty"`
}

type Comment struct {
	Comment    string  `json:"comment"`
	Status     string  `json:"status"`
	Body       string  `json:"body"`
	Target     Target  `json:"target"`
	CanvasHash string  `json:"canvasHash"`
	CreatedBy  Author  `json:"createdBy"`
	CreatedAt  string  `json:"createdAt"`
	UpdatedAt  string  `json:"updatedAt"`
	ResolvedBy *Author `json:"resolvedBy,omitempty"`
	ResolvedAt *string `json:"resolvedAt,omitempty"`
}

type ParseResult struct {
	Events   []LocatedEvent `json:"events"`
	Warnings []Warning      `json:"warnings"`
}

type FoldResult struct {
	Comments []Comment `json:"comments"`
	Warnings []Warning `json:"warnings"`
}
