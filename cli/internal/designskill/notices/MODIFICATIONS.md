# Doan modifications

Doan's design presets, returned by `doan design-skill <id>`, are adapted from Impeccable:

- Repository: https://github.com/pbakaus/impeccable
- Commit: d34c87e1a00989ae8dbdd7f6b30b70f23319e860
- License: Apache License 2.0, reproduced in `LICENSE`; the upstream third-party notices are reproduced in `NOTICE.md`.

The preset bodies are modified works, not copies. Doan rewrote and adapted the upstream text: it removed the upstream launcher, engine commands, live mode, hooks, subagents, and template placeholders; merged the shared guidance each preset needs into that preset; published the upstream `init` guidance as the `context` preset; and added Doan's canvas and workflow rules. Each preset body ends with a source line that names the upstream files it adapts and states that Doan modified them.

The adapted presets are distributed as part of Doan under the Apache License 2.0.

Guidance derived from ehmo/platform-design-skills, where a preset includes it, is also covered by `platform-design-skills-LICENSE`.
