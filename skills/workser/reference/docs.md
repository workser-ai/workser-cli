---
topic: docs
title: Project documents
summary: Say what kind of document it is, write the shape before you build, revise the page that exists, and put the diagram in the document rather than in your reply.
commands: [doc]
---

# Project documents

A document is a page in the project's Docs panel and a git-tracked markdown
mirror at `.workser/docs/<id>.md`. Both are the same document: the panel renders
the rich text, the mirror is what you, git and the next agent can read as text.

```
workser doc list [--work-item <id>] [--kind <kind>] [--search <text>]
                 [--label <name>] [--app <id>] [--infra <name>] [--limit <n>]
workser doc show <id> [--markdown]
workser doc create <title> [--kind <kind>] [--work-item <id>] [--markdown <text>]
                            [--label <name...>] [--app <id>] [--infra <name...>]
workser doc update <id> [--title <text>] [--markdown <text>]
workser doc file <id> [--kind <kind>] [--label <name...>] [--app <id>] [--infra <name...>]
workser doc diagram <id> [--check]
```

## Shape it before you build it

`--kind` says what a document IS: `architecture` (how the parts fit together),
`api-spec` (the contract between two of them), `flow` (a sequence), `tech-spec`
(the design of one change), `plan` (the steps), `note` (not a spec).

The first four are the project's **shape**. `plan` is not one of them — a list
of steps says what will be done, not how the thing works, so a project whose
only design document is a plan has no design on record.

**Structural work gets a shape document FIRST** — a new app or service, a schema
change, sign-in, money, a new outside integration. Write it, then `--ref` it to
the engineers who build against it. Everything smaller skips it: a design
nobody needed is a cost the owner pays and nobody reads.

This is the default, not a rule: an owner who says the shape is already
settled, or asks for the thing built directly, gets it built. Say once that
you skipped the design because they asked — a skip on the record is a
decision; a silent one is a gap somebody finds later.

```
workser doc create "Checkout — how it fits together" --kind architecture \
  --markdown "$(cat arch.md)" --app <appId> --label checkout --infra database
workser doc list --kind architecture --json   # is there one at all?
workser doc list --kind none --json           # written, never filed
workser doc file <id> --kind api-spec         # classify one that exists
```

`--infra` uses the project's own screen names — `database`, `storage`, `auth`,
`domains`, `functions`, `env`, `connections`, `deploy` — so a tag is also a link
to the thing it is about. `--label` shares one vocabulary with work items and
decisions: tag a doc `checkout` and the board offers the same word back.

## Revise the page that exists

The project outlives your session, and a second copy of a page is worse than no
page — nobody can tell which one is current.

```
workser doc list --json                       # is there already a page for this?
workser doc update <id> --markdown "$(cat updated.md)"
```

`workser doc show <id> --markdown` reports the mirror's path so you can open the
file with your normal tools instead of reconstructing prose from blocks.

`--work-item <id>` links a document to a Board card (a card has at most one). A
linked document renders on its card and is *hidden* from the Docs panel, so a
plan spanning several phases should stay unlinked — it belongs to the project,
not to phase 1.

## Put the diagram in the document

A page explaining how something fits together should contain the picture, not a
paragraph describing one. Write it as a ```mermaid fence in the markdown: the
Docs panel renders it, `git diff` shows it as changed lines, and the next agent
reads it without a screenshot.

```
workser doc diagram <id> --check     # exits non-zero when the page has none
```

Use `--check` on any page whose job is to explain a structure — an architecture
page, a data model, a flow. It reads the mirror on disk rather than the block
content, which is deliberate: a diagram that exists in the editor but not in the
mirror is invisible to git, to you, and to whoever opens the file next.
