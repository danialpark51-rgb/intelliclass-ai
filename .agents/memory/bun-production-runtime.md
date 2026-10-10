---
name: Bun production runtime
description: Production server behavior in this Replit workspace when Node is not on the executable path.
---

Selecting the `nodejs-22` module updated `.replit` but did not make `node` available in the shell used for verification. The Nitro Node-server build did run under Bun, and a production-mode smoke test served the app and returned a healthy `/healthz` response while the API was bound to loopback.

**Why:** the original production start command invoked `node`, but the shell reported `node: command not found`; module configuration alone did not provide the executable in the runtime used for verification.

**How to apply:** when changing the deployment runtime, use the Bun commands already configured for this project and smoke-test the built server plus its forwarded health route. Recheck if the Replit runtime changes.
