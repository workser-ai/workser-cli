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

## This is where media goes — the folder is for code

Every project has this bucket, provisioned and paid for, served over a CDN, and
visible to the owner on the Files screen. It is the **default** home for generated
art, product photography, PDFs, exports, avatars and anything a user uploads.

**Default, not mandate.** An owner who wants Cloudinary, their own S3, or anything
else is entitled to it — build it and don't argue. What is not yours to do is pick
the alternative for them, or drift into one because it was quicker. If you think
there is a real reason to go outside, say so and let them answer, then
`workser decision create` it so the next agent doesn't quietly reverse it.

**The repo is not one of the options.** Whichever provider the owner chose, files
under `public/`, `assets/` or `static/` cost them four things, none recoverable
later:

- **They are committed.** Publishing runs `git add -A` over the app folder, so
  every image enters the repository's history. Deleting it afterwards does not
  remove it.
- **They ride in every deploy.** The source bundle has a 25MB cap; enough media
  and publishing stops working outright, with an error about the bundle rather
  than about the images.
- **They cannot change without a redeploy.** A photo the owner wants swapped
  becomes a code change and a build. From the bucket it is one `storage put`.
- **They are invisible.** The Files screen lists the bucket. Nothing there shows
  what is sitting in the repo, so the owner cannot find, replace or delete it.

Small build-time assets — a logo, a favicon, an icon, an SVG the bundler inlines —
are the exception. Anything that is content, or that a user produced, is not.

```bash
workser storage put ./out/hero.png products/hero.png --json   # → .data.url
```

## Notes that matter

- **One bucket per project, shared by its apps.** Namespace your keys by app or
  feature (`invoices/2026/…`) rather than assuming the root is yours.
- **`storage get` with no destination prints a URL** instead of writing a file —
  useful when you just want to hand the user something to click.
- **This is not where app uploads should go through you.** At runtime the app uses
  `workser.storage` from `@workser/app`, and for anything large it should request a
  presigned upload URL so the bytes never pass through Workser. See the
  `workser-sdk` skill. Writing an upload handler that saves into the app's own
  filesystem is the same mistake as above, plus one more: on a serverless host the
  file is gone at the end of the request.

## Not the same as `workser neon storage`

`storage` is the default R2 bucket every project has. `neon storage` is additive
infrastructure on the project's own Neon branch, available only on dedicated tenancy
in a supported region. They are different stores — a file put in one is not visible
in the other. See `reference/neon-backend.md`.
