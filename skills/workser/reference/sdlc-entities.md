---
topic: sdlc-entities
title: Decisions and requirements
summary: Read what this project already decided, and record what a future maintainer will need. Phased work itself is subtasks, not board cards — see `workser help tasks`.
commands: [board, decision, requirement]
---

# Decisions and requirements

These are the project's memory across sessions. They write to the **same tables**
the Orbit desktop's Project Memory panel uses, so anything here appears there too
— and, inside an Orbit-spawned run, as an inline card in the conversation.
Documents have their own guide: `workser help docs`. Phased work is tracked as
subtasks, not here — see `workser help tasks`.

> **The Board (`workser board ...`) is deprecated for agent use.** It used to be
> where a multi-phase plan went, one card per phase — and the phase was ALSO a
> subtask the planning turn had just filed for the same piece of work. That gave
> a task two competing plans, one of which this task's own page never reads and
> nothing kept in sync with the other. Phases are `project_tasks` subtasks now,
> full stop: `workser task subtask add`. Do not run `workser board create` for
> planned work — see `workser help tasks`.

```
workser decision list [--limit <n>]
workser decision show <id>
workser decision create <title> --context <text> --decision <text>
                                 [--consequences <text>]

workser requirement list [--status <value>] [--limit <n>]
workser requirement show <id>
workser requirement create <title> --body <text> [--status <text>]
workser requirement update <id> [--title <text>] [--body <text>] [--status <text>]

```

## Read first — this is the part that matters

Before starting anything beyond a trivial edit:

```
workser decision list --json       # what was already decided (don't reverse it)
```

The project outlives your session. A decision recorded three weeks ago is the
only thing standing between you and quietly undoing a choice someone made on
purpose — `workser decision show <id>` gives you the context and consequences,
not just the title. Reach for `workser doc list` / `workser requirement list`
the same way when the task touches documented behaviour.

## Work with phases → subtasks + a plan doc, before you build

The moment you split a task into more than one phase, file it — not afterwards,
and not only in your reply, which is gone once the conversation scrolls.

```bash
# the phases themselves — this task's own subtask list, not the Board
workser task subtask add "Phase 1 — schema + migration" --role api \
  --note "Add orders/line_items tables and the migration."
workser task subtask add "Phase 2 — checkout API" --role api --note "…"

# the plan's narrative, ONE doc, deliberately NOT linked to a subtask
workser doc create "Checkout — implementation plan" --markdown "$(cat plan.md)" --json

# the approach, if the plan settled something with real alternatives
workser decision create "Carts live server-side" --context "…" --decision "…" --json
```

**Don't pass `--work-item` for a multi-phase plan.** A linked document renders on
its card and is *hidden* from the Docs panel; a plan spanning three phases
belongs to the project, not to phase 1.

The bar: if the user closed this conversation now, the subtask list should still
show what's left and the doc should still explain the plan to whoever continues
it.

## Decisions are append-only

`decision create` is for something with real tradeoffs worth a paper trail:
`--context` is why it came up, `--decision` what was decided, `--consequences`
the follow-on effects. There is deliberately **no `decision update`** — a record
states what was decided at a point in time. When it stops being right, record a
new decision that supersedes it and say so in its `--context`. Editing the
history is how a decision log stops being worth reading.

Requirements legitimately move along, so they do have `update`.

```
workser requirement create "Support SSO" --body "Enterprise customers need SAML." \
  --status proposed
workser requirement update <id> --status done
```

## Docs

`--markdown` is the normal way to write one. The body is stored both as the
rich text the Docs panel renders and as a git-tracked mirror at
`.workser/docs/<id>.md`; `workser doc show <id> --markdown` reports that path so
you can read the file with your normal tools.

Revise trd saying "fix the bug" is not fixing the bug.
