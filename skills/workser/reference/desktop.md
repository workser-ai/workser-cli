---
topic: desktop
title: Desktop apps — one codebase, a window, and an installer
summary: How a Workser desktop app is built, what breaks only after it is installed, and how to produce and publish a signed installer.
commands: [project, env, deploy]
---

# Desktop apps

A Workser desktop app is **one Next.js codebase with two ways to run**: a normal
web build for development and preview, and an Electron shell that loads the
static export from disk and gets packaged into an installer.

There is no deploy. A desktop app has no Vercel project and no URL — its
preview is the app running locally, and its deliverable is a file someone
double-clicks.

## The rule that breaks everything, and only after install

**The app must stay statically exportable.** A packaged Electron app loads from
`file://` and has **no Node server**. So none of this exists once it is
installed:

- server components that fetch at request time
- server actions (`"use server"`)
- route handlers under `app/api/*`
- `next/image` optimisation

Every one of them works in `npm run dev` **and** in the local preview, and fails
only on the owner's machine. That is the one direction of error nobody catches,
so `next.config.mjs` keeps `output: "export"` to make the build fail loudly
instead. Do not remove it to "fix" an import.

Need a server? Use the project's api app — `workser project apps` to find it,
then read its URL and set `NEXT_PUBLIC_API_URL`. See `workser help apps`.

## Secrets: this is a public client

Anyone who installs the app can read every string inside it. So:

- `NEXT_PUBLIC_*` only, and nothing behind that prefix is private
- never a database URL, an API key, or a `wsgw_` gateway key
- anything privileged lives in the api app and is reached over HTTP

The manifest deliberately does not declare `AI_GATEWAY_API_KEY` for this type,
which is what stops Workser seeding one. Do not add it.

## The two processes

| File | Runs where | May do |
| --- | --- | --- |
| `electron/main.js` | Node, on the machine | files, tray, windows, updates |
| `app/**` | the renderer, sandboxed | ordinary web code, no Node |
| `electron/preload.js` | the bridge | expose **named functions** only |

`contextIsolation: true` and `nodeIntegration: false` are not defaults to tidy
up — turning either off hands full filesystem and process access to page code.
Add a capability by exporting one named function from preload, never by handing
the renderer `ipcRenderer`.

## Building and shipping

```bash
npm run dev            # browser only, fastest loop
npm run dev:desktop    # the same app inside a real Electron window
npm run build          # static export -> out/
npm run dist:desktop   # the installer -> release/
```

In the app, **Publish → Your installer** does the same thing with a target
picker, progress, and a download link at the end.

## Signing — the owner's certificate, never Workser's

An unsigned build runs perfectly on the machine that made it and tells every
other machine the app is damaged (macOS) or trips SmartScreen (Windows). That
is the failure an owner cannot diagnose, so say it before they send the file.

`electron-builder` reads these from the environment; set them with
`workser env set --app <id>`:

| Platform | Keys |
| --- | --- |
| macOS | `CSC_LINK`, `CSC_KEY_PASSWORD` |
| macOS notarize | `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |
| Windows | `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` |

A Mac app can only be built on a Mac — `codesign` and `hdiutil` are Apple's and
have no substitute.

## Auto-update

Publishing uploads the installer **and** the update metadata
(`latest-mac.yml` / `latest.yml`) beside it. `electron-updater` reads only that
metadata, so an installer published alone gives you a download that works once
and an app that can never update itself — and nobody notices until release two.
Keep `publish.url` in `electron-builder.yml` pointed at the prefix the publish
step reports back.
