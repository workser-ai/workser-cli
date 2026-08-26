---
topic: goals
title: Business goals & phases
summary: The level above a task — a business requirement too big for one sitting, and the ordered phases that deliver it.
commands: [goal]
---

# Business goals & phases

A **goal** is a business requirement — "customers can buy from my site" — that
does not fit in one task. It carries an ordered list of **phase names**; a task
joins one by carrying that name (`workser task create --goal <id> --phase <name>`).
A phase has no existence apart from the tasks inside it, so it cannot drift from
the work it names.

```
workser goal list
workser goal show <id>
workser goal create <title> --phase <name...> [--outcome <text>]
                            [--criteria <json>]
workser goal update <id> [--title <text>] [--outcome <text>]
                         [--phase <name...>] [--status <value>]
workser goal check <id> <criterionId> --phase <name> (--pass|--fail|--reset) [--note <text>]
```

Status is one of: proposed, agreed, working, delivered, abandoned.

## A goal has to be argued for

Most requests are one task and should stay one task. Turning a two-hour job into
four milestones buries the owner in ceremony before anything is built — use
`workser task create` unless you can genuinely name two-plus slices that each
deliver something the owner would notice.

```
workser goal create "Launch checkout" \
  --phase "Cart" --phase "Payment" --phase "Receipts" \
  --outcome "A customer can buy something and get a receipt"
```

`--phase` needs 2–6 names. Propose the shape only — nothing is created until the
owner agrees it; planning phase four now is waste, since it will change once
phase one is real.

## Acceptance criteria are agreed with the shape

`--criteria` maps each phase name to the owner's own sentences about what "done"
means for it, e.g. `'{"Payment":["A customer can pay by card and gets a receipt"]}'`.
Written afterwards they only describe what got built; written with the shape they
can still change the plan.

Record whether one is met with `workser goal check`:

```
workser goal check g_123 c1 --phase Payment --pass \
  --note "Tested a card payment end to end; receipt emailed."
```

`--note` is required on `--pass` — a tick the owner cannot verify is worse than no
tick.

## Joining tasks to a goal

```
workser task create "Build the payment form" --goal g_123 --phase Payment
```

A goal's apps and progress are derived from the tasks that join it, not declared
up front — most of the apps a goal will touch don't exist when it's proposed.
