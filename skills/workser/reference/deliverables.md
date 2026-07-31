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
needed). It times out (default 10 min) rather than hanging forever; if it does, carry
on and state clearly what you assumed.

**Never ask for a secret value this way** — the answer is stored and displayed. Ask
*where* a key should go, then have the user set it (`workser env set` writes it
without you ever seeing it).
