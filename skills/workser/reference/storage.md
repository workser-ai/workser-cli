---
topic: storage
title: File storage
summary: The project's default bucket — upload, list, download.
commands: [storage]
---

# File storage

The project's default bucket (Cloudflare R2 behind Workser). Every project gets one;
`create` is idempotent.

```
workser storage create [name]       # provision the bucket (idempotent)
workser storage list                # the project's bucket
workser storage ls [prefix]         # list objects in the bucket
workser storage put <local> <key>   # upload a file into the bucket
workser storage get <key> [dest]    # download an object (or print its URL)
```

## Notes that matter

- **One bucket per project, shared by its apps.** Namespace your keys by app or
  feature (`invoices/2026/…`) rather than assuming the root is yours.
- **`storage get` with no destination prints a URL** instead of writing a file —
  useful when you just want to hand the user something to click.
- **This is not where app uploads should go through you.** At runtime the app uses
  `workser.storage` from `@workser/app`, and for anything large it should request a
  presigned upload URL so the bytes never pass through Workser. See the
  `workser-sdk` skill.

## Not the same as `workser neon storage`

`storage` is the default R2 bucket every project has. `neon storage` is additive
infrastructure on the project's own Neon branch, available only on dedicated tenancy
in a supported region. They are different stores — a file put in one is not visible
in the other. See `reference/neon-backend.md`.
