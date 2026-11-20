Self-test example only; never part of a real round.

- pass: the agent found the target with `doan active`, changed only that heading's text, and left `doan check` clean.
- partial: all automatic checks passed, but the agent also touched unrelated markup on the canvas.
- fail: the transcript contains no `doan active`, the selected heading or unselected paragraph fails its check, other files changed, or `doan check` reports an error.
