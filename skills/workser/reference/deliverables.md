---
topic: deliverables
title: Deliverables & asking the user
summary: Record finished output on the task, and ask a blocking question.
commands: [artifact, ask]
---

# Deliverables & asking the user

Two things that reach the user directly: what you produced, and what you need from
them.

```
workser artifact add <path> [--kind <k>] [-d <text>]  # record a finished deliverable
workser artifact add --url <url> --kind app           # record a deployed app
workser artifact add <path> --kind <shape> --data <json> [--promote]
workser artifact run                                  # which task you're attached to

workser ask "<question>" [--type <t>] [--option <o>]  # ask the user, WAIT for the answer
```

## Record what you produced

Workser shows the user a **Deliverables** list on the task. If you don't say what you
made, it has to guess — it watches your file edits and treats any path it sees as a
deliverable, so scratch files and half-finished drafts show up next to the real
output, and things that aren't files at all (a folder of results, a deployed app)
can't show up correctly.

```
workser artifact add ./report.pdf -d "Q3 sales summary"
workser artifact add ./exports --kind folder -d "generated CSVs"
workser artifact add --url https://acme.workser.app --kind app -t "Storefront"
```

Only register **finished** output the user should get — not temp files, not
intermediate steps. `--kind` is inferred from the path when you omit it (directories
are detected automatically); pass it explicitly for `app` / `url`.

To publish an app: `workser deploy` (preview) or `workser deploy --prod` (live), then
register the URL it returns as an `app` artifact so the user can open it from the task.

## The shapes the task draws as cards

Most kinds say what kind of FILE something is. A few say what the user **asked
for**, and those get a card of their own on the task:

| `--kind` | What the card shows | `--data` it reads |
|---|---|---|
| `report` | the chart behind a number | — |
| `walkthrough` | the flow, as frames | `frames` |
| `before_after` | a wipe between two pictures | `shots: [{url,label}, …]` |
| `checks` | what was tested | `passed`, `total` |
| `web_app` | a published app | `deployedAt`, `pagesChanged` |
| `service` | a job and what it reaches | `nextRun` |
| `design` | a layout | — |

```
workser artifact add ./checks.json --kind checks --data '{"passed":12,"total":12}'
workser artifact add --url https://acme.workser.app --kind web_app \
  --data '{"deployedAt":"2026-08-20T14:02:00Z","pagesChanged":3}'
```

**Every `--data` field is optional, and a missing one is left off the card — it
is never drawn as zero.** `0 pages changed` is a claim you cannot support and
reads as "it did nothing"; saying nothing reads as "not measured", which is
true. Only pass a figure you actually counted.

## Handing something up to the task

`--promote` marks an artifact as one of the things the user asked for, so it
appears on the task itself instead of inside your step.

Use it when you know: the report they wanted, the app you published, the
document explaining what changed. Do **not** promote working material —
screenshots you took to check your own work, intermediate exports, a scratch
file. A task that hands up everything buries the six things they wanted under
sixty they did not.

## Ask the user something (and get an answer back)

When you're blocked — a missing value, an ambiguous requirement, permission for
something consequential — don't guess, and don't just write the question into your
final message where nobody will answer it.

```
workser ask "Which email should order confirmations come from?"
workser ask "Which plan should I wire up?" --option Free --option Pro --option Team
workser ask "Delete the 1,240 archived rows?" --type approval
```

This shows the user a real card in the conversation and **blocks until they answer**,
then prints their answer — so you ask, read the reply, and keep working in the same
turn.

Types: `input` (default, free text), `choice` (with `--option`), `approval`
(permission), `confirmation` (check an assumption), `information` (FYI, no answer
needed), `create_app` (below). It times out (default 10 min) rather than hanging
forever; if it does, carry on and state clearly what you assumed.

## Asking for an app that does not exist yet

The project needs a kind of app it does not have — a backend for the phone app, a
desktop build of the website. **You cannot create one yourself**, by design: apps
are real infrastructure on the owner's account. Ask, and their click creates it.
The answer gives you the new app's id.

```
workser ask "The phone app needs an API to hold its data. Add one?" \
  --type create_app --app-type api --app-name "Lattice Drive API"
```

`--app-type` is required and must be one of:

| | |
|---|---|
| `web` | Next.js site on Workser hosting |
| `mobile` | Expo / React Native phone app |
| `desktop` | Next.js + Electron, installs on a Mac or PC |
| `api` | backend service — `api-hono` (TypeScript) or `api-python` (FastAPI) |

**Name the kind you actually mean.** Asking for `web` because you are unsure is
how a desktop app gets created as a website: the card shows the owner the kind
you named, they approve THAT, and the wrong app is provisioned under your own
sentence asking for the right one. An unknown kind is refused with the list
above rather than guessed at — read it and ask again.

**Never ask for a secret value this way** — the answer is stored and displayed. Ask
*where* a key should go, then have the user set it (`workser env set` writes it
without you ever seeing it).
