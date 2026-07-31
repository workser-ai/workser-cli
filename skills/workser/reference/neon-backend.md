---
topic: neon
title: The project's own Neon backend
summary: Neon-branch object storage and functions. Dedicated tenancy only.
commands: [neon]
---

# The project's own Neon backend

S3-compatible object storage and Node.js HTTP functions on the project's own Neon
branch — they branch with the database. **Additive** infrastructure, not a
replacement for `workser storage`.

```
workser neon status                       # tenancy + toggles + region verdict
workser neon storage list | create <name> | rm <bucket>
workser neon storage ls <bucket> [prefix]
workser neon storage put <bucket> <local> [key]
workser neon storage get <bucket> <key> [dest]
workser neon storage url <bucket> <key>   # temporary download URL
workser neon functions list | deploy <slug> <zip> | rm <slug>
```

## Check `neon status` first — always

Three things must all be true: **dedicated tenancy**, the capability **switched on**,
and a **supported region**.

Region is fixed when the project is created. `regionSupportsNeonBackend: false` is
**final, not retryable** — no amount of waiting or retrying changes it. When you see
it, say so plainly and fall back to `workser storage` (the default bucket).

## Notes that matter

- **`neon storage rm <bucket>` deletes the bucket and everything in it.** Not
  reversible. Confirm with the user first.
- **`neon storage url`** issues a short-lived URL — prefer it to moving large files
  through Workser.
- **Functions deploy from a zip.** Build the bundle first, then
  `workser neon functions deploy <slug> <zip>`.
- **Most apps don't need this.** If the user just wants to store uploads, the default
  bucket in `reference/storage.md` is the answer.
