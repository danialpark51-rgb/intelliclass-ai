---
name: Prisma OpenSSL runtime
description: Replit runtime dependency needed by Prisma's native query engine.
---

When Prisma client generation succeeds but API startup fails because `libssl.so.3` is missing, install the Nix `openssl` system dependency. The Prisma engine can target Debian OpenSSL 3 while that shared library is absent from the runtime.

**Why:** This imported app's API failed at startup in that state even though dependency installation and Prisma generation succeeded.

**How to apply:** For similar Prisma startup errors on Replit, use the package-management skill to add `openssl`, then regenerate the Prisma client and restart the workflow before changing Prisma's engine configuration.
