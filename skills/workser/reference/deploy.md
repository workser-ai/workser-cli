---
topic: deploy
title: Deploy, environment variables & logs
summary: Ship the app, configure it, and find out why it is down.
commands: [deploy, env, logs, versions, domain, open, verify]
---

# Deploy, environment variables & logs

Getting the app online and configured, and finding out why it isn't.

```
workser deploy [--prod] [--watch]   # deploy (git → Vercel); --watch waits for live URL
workser deploy status [id]          # status of a deploy (default: latest)
workser logs [-n 100] [-f]          # recent logs
workser versions                    # deploy history
workser domain list                 # custom domains (read)
workser open                        # open the live app
workser verify                      # run typecheck/lint/build

workser env set KEY=VALUE [K2=V2…]  # set env vars
workser env list                    # list keys (values masked)
workser env get KEY                 # one value (sensitive)
```

## Notes that matter

- **`verify` gates "done".** Run `workser verify --json` before you say a task is
  finished. `"ok": false` means fix the listed errors and re-run — a green build is
  the bar, not your reading of the diff.
- **`deploy` without `--prod` is a preview.** Preview first when the change is
  risky; `--prod` puts it in front of real users.
- **`--watch` blocks until there's a live URL.** Without it you get a deploy id and
  have to poll `deploy status`.
- **`env set` writes a value you never see.** That's the point — when the user has
  a secret, have them run it (or set it in Orbit) rather than pasting it to you.
- **`env get` returns a secret.** Don't echo it into the conversation.
- **`env rm` and `domain set` are owner-only** (exit 6). Tell the user to do it in
  Orbit; don't look for a workaround.

## After a successful deploy

Register the URL so it shows up on the user's task:

```
workser artifact add --url https://acme.workser.app --kind app -t "Storefront"
```

See `reference/deliverables.md`.

## Local vs cloud environment

`env set` configures the **cloud** environment (production and preview). The `.env`
files in the app folder configure **this computer** — the user edits those in Orbit
under Settings → "On this computer", and saving there restarts the dev server. Don't
hand-edit `.env.local` to change cloud behaviour; they are different environments.
