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
workser decision list [--limit <n>] [--search <text>] [--label <name>]
                     [--app <id>] [--infra <name>] [--status <name>]
workser decision show <id>
workser decision create <title> --context <text> --decision <text>
                                 [--consequences <text>]
                                 [--label <name...>] [--app <id>] [--infra <name...>]
workser decision tag <id> [--label <name...>] [--app <id>] [--infra <name...>]
workser decision supersede <id> [--delete]

workser requirement list [--status <value>] [--limit <n>]
workser requirement show <id>
workser requirement create <title> --body <text> [--status <text>]
workser requirement update <id> [--title <text>] [--body <text>] [--status <text>]

```

## Read first — this is the part that matters

Before starting anything beyond a trivial edit:

```
workser decision list --json                      # what was already decided
workser decision list --infra database --json     # …about the thing you're touching
```

The project outlives your session. A decision recorded three weeks ago is the
only thing standing between you and quietly undoing a choice someone made on
purpose — `workser decision show <id>` gives you the context and consequences,
not just the title. Reach for `workser doc list` / `workser requirement list`
the same way when the task touches documented behaviour.

**Narrow it.** "Read four hundred decisions first" is advice nobody follows;
"read the eleven about the database" is. `--search`, `--label`, `--app` and
`--infra` match on the server, so the answer covers the whole project rather
than the first page of it. `decision tag <id>` files one that already exists.

## Work with phases → subtasks + a plan doc, before you build

The moment you split a task into more than one phase, file it — not afterwards,
and not only in your reply, which is gone once the conversation scrolls.

```bash
# the phases — this task's own subtask list, not the Board
workser task subtask add "Phase 1 — schema + migration" --role api --note "…"

# the plan's narrative, ONE doc, deliberately NOT linked to a subtask
workser doc create "Checkout — plan" --kind plan --markdown "$(cat plan.md)" --json

# the approach, if it settled something with real alternatives
workser decision create "Carts live server-side" --context "…" --decision "…" --json
```

**A wrong row is edited, not replaced.** If a subtask's title, teammate, note or
scope is wrong after you created it, fix that same row:

```bash
workser task subtask update <id> --title "…" --role api --note "…" --scope "src/api"
```

Never tell the user a subtask is locked, and never file a second one alongside
the wrong one — a plan with a duplicate phase in it is a plan nobody can read
the progress of.

**Don't pass `--work-item` for a multi-phase plan.** A linked document renders on
its card and is *hidden* from the Docs panel; a plan spanning three phases
belongs to the project, not to phase 1.

The bar: if the user closed this conversation now, the subtask list should still
show what's left and the doc should still explain the plan to whoever continues
it.

## Decisions are append-only

`decision create` is for something with real tradeoffs worth a paper trail:
`--context` is why it came up, `--decision` what was decided, `--consequences`
the follow-on effects. There is deliberately **no text edit** — a record
states what was decided at a point in time. When it stops being right, run
`workser decision supersede <id>` and record a new one saying why. Editing the
history is how a decision log stops being worth reading.

`decision tag` is the exception, and only because none of what it changes is
part of what was decided: labels, the app, the infrastructure are how a record
is FILED, not what it says. `supersede --delete` removes a row outright — for
one created in error, never for a decision that was really made and later
reversed.

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
