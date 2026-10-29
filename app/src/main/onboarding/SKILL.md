---
name: doan
description: Create and revise design canvases with the doan CLI and app.
---

This is a discovery stub. Run `doan skill` and follow the returned guide.
When no shell is available, call the doan MCP `skill` tool instead.
If the output lacks the `[doan:skill] end of guide` line, treat it as truncated:
retrieve the complete guide before proceeding. A truncation notice (such as
"tokens truncated") means the same even with that line: save `doan skill`
output to a file and read it in parts.
If neither works, say doan's guide and presets were not applied and suggest
connecting this agent in Doan (Settings… > Connections). Do not search for,
install or run other doan binaries, or read doan's source files.
When the doan app's conversation instructions say otherwise, follow them.

doan also bundles design presets. The guide says when to use one.
List them with `doan design-skill` and read one with `doan design-skill <id>`;
over MCP, call `design_skill`, with an `id` to read one.
