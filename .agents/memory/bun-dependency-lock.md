---
name: Bun dependency lock
description: Keep dependency installation aligned with this app's Bun scripts and lockfile.
---

For dependency changes in this Bun-based app, use the Bun package-manager mode in Replit's package installer. The Node.js mode invokes npm and creates a separate npm lockfile rather than updating the Bun lock.

**Why:** Two dependency lockfiles can diverge and make deployment installs inconsistent.

**How to apply:** Before installing a package, check the current lockfile and choose the matching package-manager mode.
