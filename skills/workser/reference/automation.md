---
topic: automation
title: Workflows & connected apps
summary: Build automations that outlive the run; use Gmail, Slack, Stripe, Sheets.
commands: [workflow, connection]
---

# Workflows & connected apps

Wire up **automations** that keep running after you're done, and use third-party
accounts (Gmail, Slack, Stripe, Google Sheets) the project has connected.

```
workser workflow list | create <name> [--body <json>] | get <id>
workser workflow activate <id> | deactivate <id> | run <id> [--wait] [--body <json>]
workser workflow runs <id>          # past executions of a workflow
workser workflow nodes [query]      # search the node-type catalog

workser connection list [--toolkit <slug>]  # connectable + connected third-party apps
workser connection search "<query>" [--toolkit <slug>] [--limit N]  # find an action across every toolkit
workser connection connect <toolkit> | disconnect <connectionId>
workser connection tools <toolkit>          # browse one connected toolkit's actions
workser connection run <toolSlug> [--body <json>]  # execute one action
```

## Building a workflow

`workser workflow create` builds an event-driven, multi-step automation — the same
engine Workser's own web Workflow tab uses. Nodes, connections and triggers go in
`--body` as JSON.

**Browse `workser workflow nodes` first.** Inventing a node type that doesn't exist
produces a workflow that saves and then never runs.

Created workflows start inactive: `workser workflow activate <id>` when it's ready.

## Using a connected app

1. `workser connection list` — check what's already connected before asking for anything.
2. If it isn't: `workser connection connect <toolkit>` returns an OAuth link. The **user**
   must open it; you cannot complete OAuth on their behalf. Wait, then continue.
3. Don't know the exact action? `workser connection search "<query>"` finds it across
   every toolkit; `workser connection tools <toolkit>` browses one toolkit you already
   know. Either way, read the argument schema rather than guessing field names.
4. `workser connection run <toolSlug> --body '{"…":…}'` — e.g. `GOOGLESHEETS_APPEND_ROW`,
   `GMAIL_SEND_EMAIL`.

**A `run` is a real side effect in someone's real account.** Sending an email or
charging a card is not a dry run — say what you're about to do before you do it.

## The half people forget

A workflow-backed feature is two-way. Triggering it is the outbound half; when the
workflow produces a result the app needs, its final node has to POST back to a
webhook route in the app. Build only the trigger and the workflow runs perfectly
while nothing ever appears in the product. The app-side receiver is covered in the
`workser-sdk` skill under workflows.
