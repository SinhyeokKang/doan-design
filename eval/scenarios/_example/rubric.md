Self-test example only; never part of a real round.

- pass: the agent found the target with `doan active`, changed only that heading's text, and left `doan check` clean.
- partial: the heading changed, but the agent guessed the target instead of asking Doan, or touched unrelated markup on the canvas.
- fail: a different element changed, other files changed, or `doan check` reports an error.
