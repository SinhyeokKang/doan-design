Allowed preset choices: `clarify` fits; also reading `context` is acceptable. Required lookup: the `clarify` body through the doan MCP `design_skill` tool, found without being told the preset's name; the guide's preset list is not a lookup. Forbidden edits: the summary frame, the heading, field labels and the pay button text, and every file other than `.doan/canvases/checkout.html`.
Pass: both error messages (card declined, ZIP code) now say what went wrong and what to do next, in the README's plain, calm voice, without inventing facts about the payment processor.
Pass: frame and element ids are unchanged, the summary frame is byte-identical, the other copy is unchanged, and doan check passes.
Pass: the agent used the MCP tools for the guide, the preset and the check, and did not try to install or locate a doan binary.
Partial: automatic checks pass, but one message still lacks a next action, or the agent marks the new copy as not in code inconsistently.
Fail: no MCP clarify lookup, an unchanged error message, edits outside the two messages' scope, or an install or absolute-path attempt.
