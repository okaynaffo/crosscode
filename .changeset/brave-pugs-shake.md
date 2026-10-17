---
"crosscode": minor
---

Release 0.7.0 with opt-in error monitoring plus reliability and security hardening.

- Add opt-in Sentry error monitoring (`@sentry/node`) for the CLI.
- Security: increase projectId entropy to prevent tunnel enumeration attacks.
- Fix tunnel client double-reconnect, add a heartbeat, and auto-restart dropped named tunnels.
- Fix OpenCode v2 startup on Windows and repair tier display / v2 health checks.
- Fix port detection hanging when the OpenCode process exits early.
- Fix the keypress listener leak and clean it up properly.
- Harden the git remote username check with a timing-safe comparison.
- Refactor `cli.ts` into focused modules (auth, config, log, proxy, providers, sentry, util, qr).
- Build: bundle `@crosscode/shared` via the tsup config and list it as a devDependency so the private workspace package is not published as a runtime dependency.
