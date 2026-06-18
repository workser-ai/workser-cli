---
name: workser
description: Deploy and manage real apps on Workser infrastructure. Use when the user wants to provision a database/auth/storage, deploy an app, set env vars, attach a domain, or check deploy status/logs. Runs the `workser` CLI.
---

# Workser — ship & run apps from the terminal

You have the `workser` CLI. It lets you act as the user's DevOps + platform
engineer: provision infrastructure, deploy, and manage live apps on Workser —
**on the user's own account**, through the Workser Orbit app (which handles auth,
approvals, and shows the user what you're doing).

## When to use this
Reach for `workser` whenever the task involves **running** software, not just writing it:
- "deploy this", "put it online", "give me a URL"
- "add a database / login / file storage"
- "set an API key / env var", "add my domain"
- "is it deployed?", "show logs", "why is it down?"

For writing code, keep using your normal tools. Use `workser` for the last mile.

## Golden rules
1. **Always pass `--json`.** Output is then a single stable line:
   `{"ok":true,"data":...}` or `{"ok":false,"error":{"code","message",...}}`. Parse it.
2. **Orient first.** Run `workser status --json` to see the connection, the current
   project, and the latest deploy before acting.
3. **One project per directory.** `workser project use <id>` (or `project create`)
   links a project to the cwd; later commands target it automatically. Pass
   `--project <id>` to override.
4. **Commands are idempotent.** `db create` / `auth enable` / `storage create`
   return the existing resource (`"created": false`) instead of erroring.
5. **Approvals are normal.** Destructive/financial actions may return
   `{"error":{"code":"awaiting_approval"}}` (exit 5) while the user approves in the
   Orbit UI. Tell the user to approve, then retry — do **not** try to bypass it.
6. **Never ask for or store credentials.** Auth is handled by Orbit; you never see keys.

## Command reference
```
workser status                      # connection + current project + latest deploy
workser whoami                      # who am I / which workspace

workser project create <name>       # create + link a project to this dir
workser project list                # list projects (● = current)
workser project use <id>            # link an existing project to this dir

workser db create                   # provision Postgres (Neon)
workser db url                      # connection string (sensitive)

workser auth enable                 # turn on auth (Better Auth)
workser storage create [name]       # provision object storage (R2)

workser env set KEY=VALUE [K2=V2…]  # set env vars
workser env list                    # list keys (values masked)
workser env get KEY                 # one value (sensitive)
workser env rm KEY                  # remove

workser deploy [--prod] [--watch]   # deploy (git → Vercel); --watch waits for live URL
workser deploy status [id]          # status of a deploy (default: latest)
workser logs [-n 100] [-f]          # recent logs
workser domain set <domain>         # attach a custom domain (returns DNS records)
workser open                        # open the live app
```

## Typical flow: build → ship
```bash
workser status --json                       # 1. orient
workser project create my-app --json        # 2. create + link (if new)
workser db create --json                    # 3. provision what the app needs
workser env set STRIPE_KEY=sk_live_… --json
# … you write the app code with your normal tools …
workser deploy --prod --watch --json        # 4. ship; returns the live URL
```

## Reading results
- Success: use `.data` (e.g. `.data.url` after deploy, `.data` array after `list`).
- Failure: check `.error.code`:
  - `not_connected` → tell the user to open Workser Orbit (or `workser login` for CI).
  - `unauthorized` → user needs to authenticate.
  - `no_project` → run `workser project use <id>` or pass `--project`.
  - `awaiting_approval` → user must approve in Orbit; then retry.

Keep the user informed in plain language ("Provisioned a database and deployed —
it's live at <url>"), not raw JSON.
