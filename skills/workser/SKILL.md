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

## When to use this
Reach for `workser` whenever the task involves **running** the current app, not just writing it:
- "deploy this", "put it online", "give me a URL"
- "set an API key / env var", "what's the database URL?"
- "upload this file", "list what's in storage"
- "is it deployed?", "show logs", "why is it down?"

For writing code, keep using your normal tools. Use `workser` for the last mile.

## Golden rules
1. **Always pass `--json`.** Output is then a single stable line:
   `{"ok":true,"data":...}` or `{"ok":false,"error":{"code","message",...}}`. Parse it.
2. **Orient first.** Run `workser status --json` to see the connection, the pinned
   project, and the latest deploy before acting. You don't pick or switch projects.
3. **Stay in your lane.** `error.code = "owner_only"` (exit 6) means the action
   (creating/switching projects, deleting env vars, attaching domains) is reserved
   for the owner in Orbit. Don't retry or look for a workaround — tell the user, then
   continue. Provisioning the *pinned project's own* db / bucket / auth is allowed
   (it may be approval-gated, not owner-only).
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

## Command reference
```
workser status                      # connection + pinned project + latest deploy
workser whoami                      # who am I / which workspace
workser project show                # the project pinned to this directory
workser project list                # the workspace's projects (read)

workser db create                   # provision the Neon Postgres database (idempotent)
workser db url                      # connection string (sensitive; least-privilege role)
workser db list                     # database status
workser db tables                   # list tables in the database
workser db schema <table>           # a table's columns
workser db data <table> [-n N] [--offset N]   # read rows
workser db query "<sql>"            # run SQL (writes are approval-gated)
workser auth enable                 # provision auth for the project (idempotent)
workser auth status                 # is auth enabled? + Neon auth mode

workser env set KEY=VALUE [K2=V2…]  # set env vars
workser env list                    # list keys (values masked)
workser env get KEY                 # one value (sensitive)

workser storage create [name]       # provision the bucket (idempotent)
workser storage list                # the project's bucket
workser storage ls [prefix]         # list objects in the bucket
workser storage put <local> <key>   # upload a file into the bucket
workser storage get <key> [dest]    # download an object (or print its URL)

workser deploy [--prod] [--watch]   # deploy (git → Vercel); --watch waits for live URL
workser deploy status [id]          # status of a deploy (default: latest)
workser logs [-n 100] [-f]          # recent logs
workser versions                    # deploy history
workser domain list                 # custom domains (read)
workser open                        # open the live app
workser verify                      # run typecheck/lint/build — gate "done" on this passing

workser agent list                  # main agent + configured roles (+ which are runnable)
workser agent run <role> "<task>"   # delegate a focused subtask to a role (runs isolated)
workser agent main                  # show the configured main agent

workser workflow list | create <name> [--body <json>] | get <id>
workser workflow activate <id> | deactivate <id> | run <id> [--wait] [--body <json>]
workser workflow runs <id>          # past executions of a workflow
workser workflow nodes [query]      # search the node-type catalog
workser app list [--toolkit <slug>] # connectable + connected third-party apps
workser app connect <toolkit> | disconnect <connectionId>
workser app tools <toolkit>         # a connected app's callable actions
workser app run <toolSlug> [--body <json>]  # execute one action (e.g. GOOGLESHEETS_APPEND_ROW)

workser tool list                   # computer-use tools available to you right now
workser tool run <name> [--body <json>]  # filesystem/shell/screenshot/input/clipboard/browser

workser memory add "<content>" [--metadata <json>]  # remember something across future conversations
workser memory search "<query>" [--limit N]         # recall what you (or a cloud agent) learned before
workser memory forget <memoryId>                    # soft-delete an outdated/incorrect memory

workser artifact add <path> [--kind <k>] [-d <text>]  # record a finished deliverable
workser artifact add --url <url> --kind app          # record a deployed app
workser artifact run                                 # which task you're attached to

workser ask "<question>" [--type <t>] [--option <o>] # ask the user, WAIT for the answer

# owner-only (return owner_only / exit 6 — ask the user to do these in Orbit):
#   project create · project use · env rm · domain set
```

## Memory (remember across conversations, not just this one)
Every conversation you run is otherwise a fresh start — no memory of what you or the
user decided last time. `workser memory add "<content>"` fixes that: it stores durable,
searchable memory for the CURRENT PROJECT, and it's the SAME memory space Workser's own
cloud agents write to for this project — so add something here and a cloud agent (or
your own next conversation) can `workser memory search` and find it. Use it for things
worth remembering past this one conversation: user preferences, decisions made,
important context, requirements — not routine chatter. Before assuming you don't know
something about this project, `workser memory search "<topic>"` first; it may already be
recorded. `forget` soft-deletes a specific memory if it's wrong or outdated — the
content stays retrievable by ID but excluded from future searches.

## Record what you produced (deliverables)
Workser shows the user a **Deliverables** list on the task. If you don't say what you
made, it has to guess — it watches your file edits and treats any path it sees as a
deliverable, so scratch files and half-finished drafts show up next to the real output,
and things that aren't files at all (a folder of results, an app you deployed) can't
show up correctly. Fix that by declaring finished output:
```
workser artifact add ./report.pdf -d "Q3 sales summary"
workser artifact add ./exports --kind folder -d "generated CSVs"
workser artifact add --url https://acme.workser.app --kind app -t "Storefront"
```
Only register FINISHED output the user should get — not temp files, not intermediate
steps. `--kind` is inferred from the path when you omit it (directories are detected
automatically); pass it explicitly for `app` / `url`. `workser artifact run` shows which
task you're currently attached to.

To publish an app: `workser deploy` (preview) or `workser deploy --prod` (live), then
register the URL it returns as an `app` artifact so the user can open it from the task.

## Ask the user something (and get an answer back)
When you're blocked — a missing value, an ambiguous requirement, permission for
something consequential — don't guess and don't just write the question into your
final message. Run:
```
workser ask "Which email should order confirmations come from?"
workser ask "Which plan should I wire up?" --option Free --option Pro --option Team
workser ask "Delete the 1,240 archived rows?" --type approval
```
This shows the user a real card in the conversation and **blocks until they answer**,
then prints their answer — so you ask, read the reply, and keep working in the same
turn. Types: `input` (default, free text), `choice` (with `--option`), `approval`
(permission), `confirmation` (check an assumption), `information` (FYI, no answer
needed). It times out (default 10 min) rather than hanging forever; if it does, carry
on and state clearly what you assumed.

**Never ask for a secret value this way** — the answer is stored and displayed. Ask
where a key should go, then have the user set it (`workser env set` writes it without
you ever seeing it).

## Computer-use tools (your hands on this machine)
`workser tool list` shows what's available — filesystem (read/write/list/delete/move),
shell (run a command/Python/Node), screenshots and screen info, mouse/keyboard input,
clipboard, notifications, and basic browser control (open a URL, read the page, click/
fill/type, screenshot). This is the SAME engine Workser's cloud Computer Use agent uses
when it controls a user's machine remotely — you're getting it locally, gated by the
same safety policy (blocked paths like `~/.ssh`, blocked destructive commands, rate
limits). Sensitive actions (writing/deleting files, running a shell command, clicking/
typing) may return `awaiting_approval` (exit 5) — same handling as any other gated
action: tell the user to approve in Orbit, then retry. This is a curated subset, not
full desktop automation — check `workser tool list` rather than assuming a capability
exists.

## Workflow automation & app integrations
Beyond one-shot code, wire up **automations** that keep running after you're done:
`workser workflow create` builds an event-driven, multi-step automation (the same
engine Workser's own web Workflow tab uses) — nodes/connections/triggers go in
`--body` as JSON; browse `workser workflow nodes` first. Before an automation (or you,
directly) can use a third-party app (Gmail, Slack, Stripe, Google Sheets, ...), the
user connects it once via `workser app connect <toolkit>` — this opens an OAuth link,
ask the user to complete it, then continue. After that, `workser app run <toolSlug>
--body '{"...":...}'` calls any of its actions. Check `workser app list` before
assuming you need to ask the user to connect something new.

## Delegate to roles
The user can configure **roles** — named specialists each backed by a local CLI agent
(e.g. `qa` → codex, `designer` → claude_code). Delegate a focused subtask with
`workser agent run <role> "<task>" --json`; the role runs as an **isolated local
subagent** (its own context) and returns `{role, agent, output, exitCode}`.

- Run `workser agent list --json` first to see which roles are configured + runnable.
- Hand off focused subtasks (review this diff, design this screen) to keep your own
  context lean and get a specialized second perspective. A non-zero `exitCode` means
  the role's run failed — surface that, don't silently ignore it.

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
