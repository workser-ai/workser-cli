---
topic: sdlc-entities
title: Board cards, decisions, requirements, and docs
summary: Read what this project already tracks and decided, keep the Board honest as you work, and record what a future maintainer will need.
commands: [board, decision, requirement, doc]
---

# Board cards, decisions, requirements, and docs

These are the project's memory across sessions. They write to the **same tables**
the Orbit desktop's Board, Project Memory, and Docs panels use, so anything here
appears there too — and (when this CLI runs inside an Orbit-spawned agent run)
as an inline card in the conversation you're working in.

```
workser board list [--status <value>] [--label <value>] [--limit <n>]
workser board show <id>
workser board create <title> [--description <text>] [--status <value>]
                              [--priority <value>] [--label <value>]
                              [--owner <name>] [--milestone <id>]
workser board update <id> [--title|--description|--status|--priority
                           |--label|--owner|--milestone ...]
workser board move <id> <backlog|in-progress|in-review|done>
workser board close <id>

workser decision list [--limit <n>]
workser decision show <id>
workser decision create <title> --context <text> --decision <text>
                                 [--consequences <text>]

workser requirement list [--status <value>] [--limit <n>]
workser requirement show <id>
workser requirement create <title> --body <text> [--status <text>]
workser requirement update <id> [--title <text>] [--body <text>] [--status <text>]

workser doc list [--work-item <id>]
workser doc show <id> [--markdown]
workser doc create <title> [--work-item <id>] [--markdown <text>]
                            [--content-json <json>]
workser doc update <id> [--title <text>] [--markdown <text>]
```

## Read first — this is the part that matters

Before starting anything beyond a trivial edit:

```
workser board list --json          # what's already tracked (don't re-file it)
workser decision list --json       # what was already decided (don't reverse it)
```

The project outlives your session. A decision recorded three weeks ago is the
only thing standing between you and quietly undoing a choice someone made on
purpose — `workser decision show <id>` gives you the context and consequences,
not just the title. Reach for `workser doc list` / `workser requirement list`
the same way when the task touches documented behaviour.

## Keep the Board honest while you work

A Board still reading `backlog` after the feature shipped tells the user the
opposite of the truth. Moving the card is part of finishing the work:

```
workser board move <id> in-progress   # you picked it up
workser board move <id> in-review     # ready for the user to look at
workser board close <id>              # done and verified
```

`--status` is one of `backlog | in-progress | in-review | done` (default
`backlog`). `--priority` is one of `low | normal | high | urgent` (default
`normal`). `--label` repeats for more than one label:

```
workser board create "Fix the login bug" --status in-progress --priority high \
  --label bug --label auth
```

`board update` replaces the labels you pass rather than merging them, and
touches only the fields you name. There is no `board delete` — `done` is the
terminal state for finished work, and removing a card the user filed is theirs
to do in Orbit.

## Decisions are append-only

`decision create` is for something with real tradeoffs worth a paper trail:
`--context` is why it came up, `--decision` is what was decided,
`--consequences` is the follow-on effects. There is deliberately **no
`decision update`** — a decision record states what was decided at a point in
time. When it stops being right, record a new decision that supersedes it and
say so in its `--context`. Editing the history is how a decision log stops
being worth reading.

Requirements are different: they legitimately move along, so they do have
`update`.

```
workser requirement create "Support SSO" --body "Enterprise customers need SAML." \
  --status proposed
workser requirement update <id> --status done
```

## Docs

`--markdown` is the normal way to write one. The body is stored both as the
rich-text content the Docs panel renders and as a git-tracked markdown mirror
at `.workser/docs/<id>.md` — `workser doc show <id> --markdown` reports that
path so you can read the file with your normal tools.

Revise the page that exists rather than creating a second copy of it:

```
workser doc list --json                       # is there already a page for this?
workser doc update <id> --markdown "$(cat updated.md)"
```

`--work-item <id>` links a document to a Board card (a card has at most one).

## When to record, and when not to

Record what a future maintainer would need: follow-up work you found but didn't
do, a choice between real alternatives, a behaviour worth writing down. Don't
narrate every small step — and never treat filing a card as a substitute for
the work. Creating a Board card that says "fix the bug" is not fixing the bug.
