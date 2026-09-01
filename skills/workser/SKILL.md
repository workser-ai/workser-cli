---
name: workser
description: Provision, deploy, and operate the current Workser app. Use when the user wants to provision or browse the Neon Postgres database, deploy, set env vars, manage files in the bucket, provision auth, or check deploy status/logs for the project linked to this directory. Runs the `workser` CLI.
---

# Workser — ship & run the current app from the terminal

You have the `workser` CLI. Use it to operate the **one project** Workser Orbit has
linked to this directory — infrastructure, config, shipping — **on the user's own
account**, through the Orbit app, which handles auth and shows them what you're
doing. For writing code, keep using your normal tools.

## Read one guide, not all of them

This page is the index. `workser help <topic>` prints one focused guide, about a
screen long. Find your row, run that **one** command — you pay for every line you
load.

| You need to… | Commands | Run |
| --- | --- | --- |
| Track a business requirement too big for one task, and its phases | `goal …` | `workser help goals` |
| See what was decided or written down for this project | `decision …`, `requirement …`, `doc …` | `workser help sdlc-entities` |
| Follow the project's brand — colours, fonts, logo | `design …` | `workser help brand` |
| Provision or query Postgres; list end users | `db …`, `auth …` | `workser help database` |
| Deploy, set env vars, read logs, check a domain | `deploy`, `env …`, `logs`, `versions`, `domain`, `open` | `workser help deploy` |
| Save work before a risky change, undo it, sync this folder | `checkpoint`, `restore`, `sync` | `workser help version-control` |
| Put files in the project's bucket | `storage …` | `workser help storage` |
| Read or write products, orders, customers, deals | `business …` | `workser help business` |
| Use the project's own Neon buckets or functions | `neon …` | `workser help neon` |
| Build an automation, or use Gmail/Slack/Stripe/Sheets | `workflow …`, `app …` | `workser help automation` |
| Generate an image | `image …` | `workser help images` |
| Hand a subtask to another agent | `agent …` | `workser help roles` |
| Ship an AI agent inside the user's app | `cloud-agent …` | `workser help cloud-agents` |
| Recall across conversations; leave this task's team a fact | `memory …`, `workser note` | `workser help memory` |
| Record finished output, or ask the user a question | `artifact …`, `ask` | `workser help deliverables` |
| Control this machine — files, shell, screen, browser | `tool …` | `workser help computer-use` |

`workser help` lists them all; `workser <command> --help` gives exact flags. Both
come from the CLI itself, so they match the version you are running.

## Orientation (no guide needed)

```
workser status                # connection + pinned project + latest deploy
workser whoami                # who am I / which workspace
workser project show          # the project pinned to this directory
workser project list          # your organization's projects
workser verify                # run typecheck/lint/build — gate "done" on this
workser doctor                # resolved endpoint, mode, token presence, project
workser login                 # authenticate outside Orbit (CI/standalone)
workser logout                # clear a saved standalone session
```

## Scope (read this)

You operate on **a project's own infrastructure**, and you *can* provision and
use it: database, bucket, auth, deploys, env vars, files. Sensitive actions are
**gated** (`awaiting_approval`, exit 5) — see rule 5.

What you **cannot** do is administer the project set or destroy config:
`project create` · `project use` · `env rm` · `domain set` return
`error.code = "owner_only"` (exit 6). Tell the user it's an owner action to do in
Orbit, then continue.

**One organization.** The folder (or the project open in Workser) sets it. You
may move between its projects — `--project <id>`, or `cd`. Another org
returns `error.code = "out_of_scope"` (exit 7) and runs nothing.

## Golden rules

1. **Always pass `--json`.** Output is then a single stable line:
   `{"ok":true,"data":...}` or `{"ok":false,"error":{"code","message",...}}`. Parse it.
2. **Orient first.** Run `workser status --json` to see the connection, the pinned
   project, and the latest deploy before acting.
   For anything beyond a trivial edit, also read what the project already knows:
   `workser decision list --json` (what was already decided, so you don't quietly
   reverse it), and `workser design show --json` before writing UI. This project
   outlives your session; that context is how you don't start from zero.
3. **A phased plan goes on the subtask list, never the Board.** Phases are
   `workser task subtask add` — not `board create`, which makes a second,
   driftable "the plan" the task page never reads. Write the narrative once as
   `doc create`, plus `decision create` for a real tradeoff. A plan in your
   reply alone is gone when the conversation scrolls. How to correct a wrong
   row, and what not to link: `workser help sdlc-entities`.
4. **Stay in your lane.** On `owner_only` (exit 6) or `out_of_scope` (exit 7),
   don't retry or look for a workaround — tell the user, then continue.
   Provisioning the *pinned project's own* db / bucket / auth is allowed (it may
   be approval-gated, not owner-only).
5. **Approvals are normal — likely unattended, nobody watching.** An action may
   return `{"error":{"code":"awaiting_approval"}}` (exit 5). Say so, **stop this
   turn** — never a retry loop or sleep-and-recheck, it just times out. Works next
   time, once approved.
6. **Never ask for or store credentials.** Auth is handled by Orbit; you never see keys.
7. **Verify before "done".** Before telling the user a task is complete, run
   `workser verify --json` (runs the project's typecheck/lint/build). If it
   reports `"ok": false`, fix the errors it lists and re-run until it passes —
   a green build is the bar for "done", not your own judgement.
8. **Destructive shell actions are blocked.** Irreversible commands (`rm -rf /`,
   `git reset --hard`, `DROP`/`TRUNCATE`, `curl | sh`, …) are refused by Workser's
   safety policy — don't attempt them; use migrations + scoped changes instead.

## Typical flow: build → ship

```bash
workser status --json                            # 1. orient (project is already pinned)
workser decision list --json                     # 2. what's already decided
workser task subtask add "Phase 2 — …" --json     # 3. phases? file them as subtasks
workser doc create "Plan" --markdown "…" --json   # 4. the plan's narrative, once
workser db create --json                          # 5. provision infra the app needs (idempotent)
workser env set STRIPE_KEY=sk_live_… --json      # 6. configure it
# … you write the app code with your normal tools …
workser verify --json                             # 7. green build is the bar for "done"
workser deploy --prod --watch --json              # 8. ship; returns the stable *.workser.app URL
```

## Reading results

- Success: use `.data` (e.g. `.data.url` after deploy, `.data` array after `list`).
- Failure: check `.error.code`:
  - `not_connected` → tell the user to open Workser Orbit (or `workser login` for CI).
  - `unauthorized` → user needs to authenticate.
  - `no_project` → no project is linked here; the user links it in Orbit.
  - `owner_only` → an owner action; tell the user to do it in Orbit, then continue.
  - `awaiting_approval` → someone must approve in Orbit; say so, stop, don't poll.
  - `needs_local_app` → this machine has no Workser app, so folder commands
    can't run. Say so; don't reach for `git` instead.

Keep the user informed in plain language ("Provisioned a database and deployed —
it's live at <url>"), not raw JSON.

## Writing app code, not operating the app

`workser db query` is for **you** to inspect the database while building. It is not
how the app reads its own data at runtime — that's `@workser/app`, covered by the
`workser-sdk` skill. Using the CLI where the SDK belongs is the most common mistake
here.
