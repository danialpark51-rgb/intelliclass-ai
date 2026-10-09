---
name: Bun transitive security overrides
description: Compatibility and lockfile behavior when overriding vulnerable transitive package versions with Bun.
---

When transitive consumers require different major versions, keep security overrides version-scoped rather than pinning one major globally. In Bun 1.3.6, nested override objects emit an unsupported warning; version-scoped override keys work. A global `brace-expansion` 5.x pin broke the `minimatch` 3.x consumer because its expected API differs.

**Why:** Applying security fixes without matching each consumer's supported major can clear the audit while breaking tools such as ESLint.

**How to apply:** Check the active Bun version's override support, inspect the resolved `bun.lock` entries after re-resolution, and run tests/lint that exercise the affected consumers.
