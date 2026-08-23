---
topic: tasks
title: Project tasks & subtasks
summary: The ticket you are working inside: read it, break it into steps, and ask before starting.
commands: [task]
---

# Project tasks & subtasks

A **project task** is a ticket the owner filed. You are usually running inside
one — Orbit sets `WORKSER_PROJECT_TASK_ID` on your process, so every command
below defaults to it and you rarely pass an id at all.

```
workser task list [--status <value>] [--label <value>] [--limit <n>]
workser task show [id]                  # the task you are in, with its steps
workser task create <title> [--note <text>] [--kind <value>]
                           [--label <value...>] [--app <id...>]
                           [--infra <ref...>]

workser task subtask add <title> [--role <value>] [--kind <value>]
                                 [--note <text>] [--app <id...>]
                                 [--infra <ref...>] [--scope <path...>]
                                 [--depends-on <key...>]
workser task subtask list [taskId]
workser task subtask update <id> [--title|--note|--role|--kind|--scope]
workser task subtask remove <id>
workser task subtask send-back <id> --note <text>   # redo it, and say why

workser task can-start [id]             # may work begin? refuses until approved
workser task approval request           # tell the owner the plan is ready
workser task move <id> <status>
workser task done [id] --summary <text>
```

## This is not `workser board`

`board` is the Orbit Board — a human's list of work items. `task` is the AI Tech
Team's own table. Filing your plan on the Board puts it somewhere the owner's
task page never reads: they see "created work item" and an empty plan. Use
`task subtask add`.

## Opening work from a project channel

When a project-channel conversation produces actionable work, the PM may record
it with `workser task create`. Orbit supplies the channel and source-message IDs;
the command records them and posts the new task card as a Project Manager message
automatically. Do not invent or ask for those IDs.

Opening a task does **not** approve it or start implementation. The task remains
awaiting the owner. Never approve or dispatch a task you opened yourself.

## Planning a task

Read the project first, then propose. One `subtask add` per step:

```
workser task subtask add "Build the upload endpoint" \
  --role api --kind service \
  --note "Accept a file, work out its type, hand it to the right analyzer." \
  --scope src/app/api/analyze/route.ts

workser task subtask add "Check every supported file type end to end" \
  --role qa --depends-on RIZZ-15
```

`--role` is one of: pm, architect, web, api, automation, qa.
`--kind` is what the step produces: data_reports, web, mobile, service,
automation, docs. It is not the same fact as the role — the same engineer
writing a screen, the docs for it and the service behind it is three kinds of
work.

`--scope` is what that step OWNS. Two steps naming the same file cannot run at
the same time, so keeping scopes apart is what lets the team work in parallel.
`--depends-on` takes the keys you read off `task show`.

Between three and six steps. If it needs more, say the task is too big instead.
The step that CHECKS work must not be the same role as the one that built it.

## Nothing runs until the owner approves

```
workser task can-start
```

This exits non-zero, with the reason, until they have approved the plan — that
refusal is the product working, not an error to route around. Ask with
`workser task approval request`; only a person can answer.

## Finishing a step

```
workser task done --summary "The report now shows cost per KOL, with six months of history."
```

Write the summary for someone who runs a business and does not read code.

## Sending a step back

A step that finished but is not good enough is **sent back**, not replaced:

```
workser task subtask send-back 3f2a… --note "The totals ignore refunds."
```

That puts it in the queue again as a **second attempt** on the same step. Two
reasons it matters that this is not a new step:

- The owner's screen can then say *"1 send-back, fixed — 2nd run passed"*. A
  replacement step says only that two steps exist, which tells them nothing
  about whether their team caught its own mistake.
- `--note` is the reason, and it is recorded against the attempt being
  rejected. Without it the history can say a step ran twice but not why.

It refuses a step that is still working. Let it finish first — the run is
still writing to it.
