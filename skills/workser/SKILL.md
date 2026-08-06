---
name: workser
description: Provision, deploy, and operate the current Workser app. Use when the user wants to provision or browse the Neon Postgres database, deploy, set env vars, manage files in the bucket, provision auth, or check deploy status/logs for the project linked to this directory. Runs the `workser` CLI.
---

# Workser — ship & run the current app from the terminal

You have the `workser` CLI. It lets you act as the user's DevOps engineer for the
**one project** Workser Orbit has linked to this directory: provision and browse its
Neon Postgres database, deploy it, manage its env vars and bucket, provision auth,
and read its logs — **on the user's own account**, through the Workser Orbit app
(which handles auth and shows the user what you're doing).

For writing code, keep using your normal tools. Use `workser` for the last mile.

## Read one guide, not all of them

This page is the index. The detail lives in the CLI itself — `workser help <topic>`
prints one focused guide, about a screen long. Find your row, run that **one**
command. Don't print them all; you are paying for every line you load.

| You need to… | Commands | Run |
| --- | --- | --- |
| Provision or query Postgres; list end users | `db …`, `auth …` | `workser help database` |
| Deploy, set env vars, read logs, check a domain | `deploy`, `env …`, `logs`, `versions`, `domain`, `open` | `workser help deploy` |
| Put files in the project's bucket | `storage …` | `workser help storage` |
| Read or write products, orders, customers, deals | `business …` | `workser help business` |
| Use the project's own Neon buckets or functions | `neon …` | `workser help neon` |
| Build an automation, or use Gmail/Slack/Stripe/Sheets | `workflow …`, `app …` | `workser help automation` |
| Generate an image | `image …` | `workser help images` |
| Hand a subtask to another agent | `agent …` | `workser help roles` |
| Remember or recall something across conversations | `memory …` | `workser help memory` |
| Record finished output, or ask the user a question | `artifact …`, `ask` | `workser help deliverables` |
| Control this machine — files, shell, screen, browser | `tool …` | `workser help computer-use` |

`workser help` with no topic lists them. **The CLI is the source of truth**: it ships
these guides with itself, so they match the version you are running. For exact flags
on any command, `workser <command> --help` is generated from the implementation and
cannot be out of date.

## Orientation (no guide needed)

```
workser status                # connection + pinned project + latest deploy
workser whoami                # who am I / which workspace
workser project show          # the project pinned to this directory
workser project list          # the workspace's projects (read)
workser verify                # run typecheck/lint/build — gate "done" on this
workser doctor                # resolved endpoint, mode, token presence, project
workser login                 # authenticate outside Orbit (CI/standalone)
workser logout                # clear a saved standalone session
```

## Scope (read this)

You operate on **one project's own infrastructure**. You *can* provision and use it:
create the Neon database, read its connection string, browse its tables / rows / run
SQL, provision the bucket + auth, deploy, set env vars, manage files. Sensitive
actions are **gated** — the daemon may return `error.code = "awaiting_approval"`
(exit 5) and wait for the user to approve in Orbit; ask them to approve, then retry.

What you **cannot** do is administer the project set or destroy config: creating or
switching which project is pinned, deleting env vars, or attaching a custom domain.
Those return `error.code = "owner_only"` (exit 6) — tell the user it's an owner
action to do in Orbit, then continue with what you can do. The project is already
selected; you don't pick or switch it.

Owner-only, for reference: `project create` · `project use` · `env rm` · `domain set`.

## Golden rules

1. **Always pass `--json`.** Output is then a single stable line:
   `{"ok":true,"data":...}` or `{"ok":false,"error":{"code","message",...}}`. Parse it.
2. **Orient first.** Run `workser status --json` to see the connection, the pinned
   project, and the latest deploy before acting. You don't pick or switch projects.
3. **Stay in your lane.** `error.code = "owner_only"` (exit 6) means the action is
   reserved for the owner in Orbit. Don't retry or look for a workaround — tell the
   user, then continue. Provisioning the *pinned project's own* db / bucket / auth is
   allowed (it may be approval-gated, not owner-only).
4. **Approvals are normal.** Some allowed actions may return
   `{"error":{"code":"awaiting_approval"}}` (exit 5) while the user approves in the
   Orbit UI. Tell the user to approve, then retry — do **not** try to bypass it.
5. **Never ask for or store credentials.** Auth is handled by Orbit; you never see keys.
6. **Verify before "done".** Before telling the user a task is complete, run
   `workser verify --json` (runs the project's typecheck/lint/build). If it
   reports `"ok": false`, fix the errors it lists and re-run until it passes —
   a green build is the bar for "done", not your own judgement.
7. **Destructive shell actions are blocked.** Irreversible commands (`rm -rf /`,
   `git reset --hard`, `DROP`/`TRUNCATE`, `curl | sh`, …) are refused by Workser's
   safety policy — don't attempt them; use migrations + scoped changes instead.

## Typical flow: build → ship

```bash
workser status --json                       # 1. orient (project is already pinned)
workser db create --json                    # 2. provision infra the app needs (idempotent)
workser env set STRIPE_KEY=sk_live_… --json # 3. configure it
# … you write the app code with your normal tools …
workser deploy --prod --watch --json        # 4. ship; returns the live URL
```

Provisioning the pinned project's own database / bucket / auth is yours to do
(`db create`, `storage create`, `auth enable`) — the user may need to approve it in
Orbit (`awaiting_approval`). Only a **custom domain** is an owner action.

## Reading results

- Success: use `.data` (e.g. `.data.url` after deploy, `.data` array after `list`).
- Failure: check `.error.code`:
  - `not_connected` → tell the user to open Workser Orbit (or `workser login` for CI).
  - `unauthorized` → user needs to authenticate.
  - `no_project` → no project is linked here; the user links it in Orbit.
  - `owner_only` → an owner action; tell the user to do it in Orbit, then continue.
  - `awaiting_approval` → user must approve in Orbit; then retry.

Keep the user informed in plain language ("Provisioned a database and deployed —
it's live at <url>"), not raw JSON.

## Writing app code, not operating the app

`workser db query` is for **you** to inspect the database while building. It is not
how the app reads its own data at runtime — that's `@workser/app`, covered by the
`workser-sdk` skill. Using the CLI where the SDK belongs is the most common mistake
here.
