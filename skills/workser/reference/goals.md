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
                            [--criteria <json>] [--build-order <value>]
workser goal update <id> [--title <text>] [--outcome <text>]
                         [--phase <name...>] [--status <value>]
                         [--build-order <value>]
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

## Phase one is the product, not the foundations

Order the phases by what the owner can SEE, not by what is riskiest. The
instinct to resolve the hard unknown first is a good engineer's instinct and it
produces an hour of correct work with nothing to look at.

A real plan that went wrong this way: a video editor whose phase 01, "Prove one
clip becomes a video", was sign-in tenancy, a render-engine decision and
exports as durable jobs — while the editor itself, which *is* the product, sat
in phase 02 at `0 of 7`. Every task was well built. The owner still saw a team
putting off the part that mattered.

**Phase one ends in screens somebody can open and use**, and they look
finished: real layout, type and spacing, the empty, loading and error states,
usable on a phone. Lead it with a `designer` task that draws the screens; the
engineers build against those.

**What may be thin is the plumbing, never the surface.** Take the obvious
implementation, put it behind one seam, and name the hardening as its own later
phase:

```
workser goal create "Poptell — a video editor people can use" \
  --phase "One clip becomes a video you can watch" \
  --phase "The complete manual editor" \
  --phase "Make it survive real use" \
  --outcome "A creator uploads a clip, edits it, and downloads a real MP4"
```

Phase one hardcodes one render engine behind an adapter and runs the export
in-process. Phase three chooses the engine properly and adds the durable job,
the retries, the leases and the dedupe — the same architecture, planned rather
than assumed, and arriving after the owner has seen their product.

`--build-order` records which of the two the owner wants, and `workser goal
show` prints it back as a standing instruction:

- `product` (the default) — phase one is the designed, working product
- `foundations` — phase one settles the hard parts first, right for a port or a
  fixed external contract

Propose `product` unless the owner has said otherwise; they change it on the
plan card, and it is the shape of the plan, so read it before filing a phase.

### A bot is not a deliverable; a bot you can watch is

"A trading bot", "an AI agent on our LINE account", "automate the daily
report" — each names a mechanism, because the mechanism is the part the owner
has a word for. Build only that and they own a process they cannot see, cannot
stop, and cannot tell is working; every question about it becomes a message to
you, for the life of the product.

So a headless system's phase one is **the console**: is it running, what has it
done, what went wrong, what has it cost — plus start, stop, change the
settings, and run it once by hand. That is what "phase one is the product"
means when the product is a process, and it is the same rule as *every phone
app needs a backend*, in the other direction.

```
workser goal create "A bot that trades my strategy" \
  --phase "Watch it trade on a test account" \
  --phase "Run it on real money, with limits" \
  --phase "Make it survive a bad day" \
  --outcome "I can see what my bot is doing and stop it whenever I want"
```

**It has to be real.** The path runs end to end against the real app — real
sign-in, real upload, a real file back. A screen wired to fixtures is worse
than plumbing: plumbing under-reports progress, demoware over-reports it. If
the path can't be made real inside phase one, make phase one *smaller*, not
faker.

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
