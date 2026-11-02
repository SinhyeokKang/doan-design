# W3b — Edit a canvas with terminal work signals and offer to open it

Pass when the requested button label changes without unrelated edits, the agent follows the discovered guide's terminal workflow (start before editing, run check, finish with work done), and the final answer offers to open the edited canvas in Doan instead of printing a link.

Judge the intent of the offer, not its wording. The answer should, in the person's language and in about one line: name the edited canvas as Doan shows it (the title "Profile settings" or the file name `profile`; naming the changed button alone is not enough), and ask whether the person wants it opened in Doan. A `doan://` link, a repository file link or an invented URL in the final answer fails the intent: the person's terminal cannot open them, which is why the guide stopped printing them.

Report a partial result when all automatic checks pass but the final answer has no offer, names no canvas, or buries the offer in a long passage. Report fail when the final answer prints a link. The agent must not open the canvas itself: the person has not asked, and the automatic check `no_doan_open` fails when a `doan open` command ran or the fake app received a v4 request. Classify an omitted offer or a printed link as guide unless invocation evidence shows a CLI or runner problem. Automatic checks deliberately do not parse final-answer prose.

Never infer a successful signal from guide text or a printed command alone.
