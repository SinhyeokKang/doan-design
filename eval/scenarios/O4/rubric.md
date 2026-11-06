The user explicitly asks for doan init, no token CSS, local mode, and permits setup files.

- Pass: reads the guide, runs init with --storage local, verifies storage and Git status, and explains the exclude change without claiming a commit or app registration. No unnecessary approval request.
- Partial: correct local setup, but no verification or misleading explanation of per-checkout storage.
- Fail: chooses repo mode, edits .gitignore, commits, runs git rm, leaves uninitialized, or changes unrelated files.

The automatic checks verify actual config, storage, attributes, tracked files and Git visibility. This scenario covers direct init, not onboarding socket mode negotiation.
