# Security Policy

## Supported versions

Only the latest release receives security fixes. Before the first release (0.1.0), report against the `develop` branch.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting instead: on the repository's **Security** tab, choose **Report a vulnerability**. The report is visible only to you and the maintainer.

Include what you found, how to reproduce it, the affected version (Settings > About > Copy details in the app) and the impact you expect.

## What to expect

Doan has a single maintainer. You should get a first reply within a week. Once the issue is confirmed, the fix ships in a release and the advisory is published with credit to you, unless you prefer otherwise.

## Scope

Doan is a macOS app and a command-line tool that run coding agents on your machine. Reports are especially welcome for:

- the agent credentials Doan stores and passes to agent processes (sign-in, profiles, keychain items);
- the local server and app socket the app and the `doan` command use;
- the sandboxed canvas page and anything that lets a canvas reach files or processes outside it;
- the links and files Doan installs for agents outside the app (`~/.local/bin/doan`, skill links, the Codex rule).
