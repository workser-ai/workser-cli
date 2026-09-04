---
topic: apps
title: The project's other apps — what they are, and wiring one to another
summary: List every app in the project with its type, deploy state and URL; read a sibling's settings without exposing them; point a client at the right service.
commands: [project, env]
---

# The project's other apps

A project holds several apps — a web app, one or more services, maybe a phone
or desktop app — and each has its own variables. Every command here takes
`--app <webAppId>`; without it you are operating on the app whose folder you
are in.

Start from the inventory rather than guessing:

```bash
workser project apps          # every app: id, type, status, URL, local folder
workser project app <id>      # one app: preview + production URLs, local path
```

That answers the questions you actually need before wiring anything: which
services exist, whether each is **deployed or only local**, and what its
address is per environment.

### Reading another app's config without exposing it

```bash
workser env list --app <id> --env production   # KEYS only — values are masked
workser env get  <key> --app <id>              # the value. Sensitive.
```

`list` is the one to reach for. It answers "does that service already have a
`STRIPE_SECRET_KEY`?" without printing it, which is almost always the question.
Use `get` only when you genuinely need the value in hand, and never echo it into
a file the user will read, a commit, or a log.

### Copying a value from one app to another

```bash
workser env set KEY="$(workser env get KEY --app <from> --quiet)" --app <to>
```

Two rules that are not optional:

- **Match the environment.** A production key set into preview, or the reverse,
  produces an app that works in one place and fails in the other with no
  message. Pass `--env` on both sides.
- **Never copy a secret into a phone or desktop app.** Those bundles install on
  someone's device and anything inside can be read by whoever installs it. A
  client gets public values only (`EXPO_PUBLIC_*`, `NEXT_PUBLIC_*`); anything
  privileged stays in a service and the client reaches it over HTTP.

### Pulling config into a local file

```bash
workser env pull --app <id> --env preview --out .env.local
```

Writes that app's cloud variables locally so `npm run dev` behaves like the
deployed app. Keep the file out of git.

### Pointing a client at a service

There is no magic wiring. Read the service's URL from `project app <id>`, then
set it on the client under the key that client reads:

| Client | Key |
| --- | --- |
| Phone app (Expo) | `EXPO_PUBLIC_API_URL` |
| Desktop app | `NEXT_PUBLIC_API_URL` |
| Web app | `NEXT_PUBLIC_API_URL` |

Workser sets this for you **only** when the project has exactly one service —
then it is not a guess. With two or more, the choice is yours to make and to
say out loud, because nothing else can know which service that client belongs
to.
