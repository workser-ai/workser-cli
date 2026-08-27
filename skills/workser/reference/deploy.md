---
topic: deploy
title: Deploy, addresses & logs
summary: Ship the app, find its address, and find out why it is down.
commands: [deploy, logs, versions, urls, deployments, domain, open, verify]
---

# Deploy, environment variables & logs

Getting the app online and configured, and finding out why it isn't.

```
workser deploy [--env production] [--watch]   # deploy (git → Vercel); default is preview
workser deploy status [id]          # status of a deploy (default: latest)
workser urls                        # every app's stable preview + live address
workser logs [-n 100] [-f] [--env production] [--app <id>]
workser versions [--env production] # history; the badge says which env is live
workser deployments list [--env production] [--app <id>]
workser deployments inspect <id> [--logs]
workser deployments promote         # ship the latest build (the owner confirms)
workser deployments rollback <version>  # put an earlier one back (the owner confirms)
workser domain list                 # custom domains
workser domain add shop.co.th       # attach one (the owner confirms)
workser domain add app.shop.co.th --app <webAppId>
workser domain rm shop.co.th        # detach one (the owner confirms)
workser open                        # open the live app
workser verify                      # run typecheck/lint/build

```

Settings — `workser env` — are their own topic: `workser help env`.

## Notes that matter

- **`verify` gates "done".** Run `workser verify --json` before you say a task is
  finished. `"ok": false` means fix the listed errors and re-run — a green build is
  the bar, not your reading of the diff.
- **`deploy` without `--env` is a preview.** Preview first when the change is
  risky; `--env production` (or the older `--prod`, which means the same) puts it
  in front of real users. Passing both, disagreeing, is refused rather than
  resolved.
- **`urls` is where the address comes from — not the deploy response.** The host
  in a deploy response is per-build and the next deploy retires it. `urls`
  returns the stable ones, and says why an app has none rather than printing a
  blank.
- **`promote` and `rollback` are the same upstream call and two commands on
  purpose.** Promote ships the newest build; rollback puts version N back. Both
  ask the owner and return exit 7 (`awaiting_approval`) until they answer — and
  that gate holds even on a "just do it" run. Say so and stop this turn; don't
  loop or poll for the answer (see the `awaiting_approval` note below).
- **There is no `deployments cancel`.** Nothing upstream can stop a build that is
  already running. Wait for it and then promote or roll back.
- **`--watch` blocks until there's a live URL.** Without it you get a deploy id and
  have to poll `deploy status`.
- **`domain add` and `domain rm` ask the owner to confirm** and return exit 7
  (`awaiting_approval`) until they do — say plainly that it needs approval in
  Orbit and stop this turn; the same command works on its own once it's approved,
  so don't write a retry loop or poll for it. Domains Workser owns (`workser.ai`
  and its subdomains) and hostnames the hosting provider assigns (`*.vercel.app`)
  are refused outright: those are not attachable, and the app's own preview and
  live URLs already exist without attaching anything.

## After a successful deploy

Register the URL so it shows up on the user's task:

```
workser artifact add --url https://acme.workser.app --kind app -t "Storefront"
```

See `reference/deliverables.md`.
