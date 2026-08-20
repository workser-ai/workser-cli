---
topic: docs
title: Project documents
summary: Write and revise the project's pages, keep the markdown mirror readable, and put the diagram in the document rather than in your reply.
commands: [doc]
---

# Project documents

A document is a page in the project's Docs panel and a git-tracked markdown
mirror at `.workser/docs/<id>.md`. Both are the same document: the panel renders
the rich text, the mirror is what you, git and the next agent can read as text.

```
workser doc list [--work-item <id>]
workser doc show <id> [--markdown]
workser doc create <title> [--work-item <id>] [--markdown <text>]
                            [--content-json <json>]
workser doc update <id> [--title <text>] [--markdown <text>]
workser doc diagram <id> [--check]
```

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
