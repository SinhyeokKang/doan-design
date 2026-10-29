Allowed preset choices: `critique` fits; `audit` is also acceptable, and reading `context` as well is acceptable. Required lookup: the `critique` or `audit` body. Any other preset fails. Forbidden edits: every file; this is a review only.
Pass: the answer is a prioritized report that names the vague error messages ("Error 402.", "Invalid input."), the generic "Submit" action, and other real issues on the canvas, each with a concrete fix, and says what it could not verify (for example rendering or contrast).
Pass: the agent changes no file and resolves no comment.
Partial: no files change, but the findings are generic, unprioritized, or claim checks the agent could not run.
Fail: no critique or audit lookup, a preset outside the allowed set, any file change, or the agent applies fixes.
