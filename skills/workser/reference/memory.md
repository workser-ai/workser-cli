---
topic: memory
title: Memory across conversations
summary: Store and recall durable project knowledge shared with cloud agents.
commands: [memory]
---

# Memory — remember across conversations, not just this one

```
workser memory add "<content>" [--metadata <json>]  # remember for future conversations
workser memory search "<query>" [--limit N]         # recall what was learned before
workser memory forget <memoryId>                    # soft-delete an outdated memory
```

## Why this exists

Every conversation you run is otherwise a fresh start — no memory of what you or the
user decided last time. This stores durable, searchable memory for the **current
project**, and it is the **same memory space** Workser's cloud agents write to for
this project. Add something here and a cloud agent — or your own next conversation —
can `memory search` and find it.

## Using it well

- **Search before assuming you don't know.** Before concluding something about this
  project is undocumented, run `workser memory search "<topic>"`. It may already be
  recorded.
- **Store decisions, not chatter.** User preferences, decisions made, constraints,
  requirements — things worth knowing next week. Not "the build passed".
- **`forget` is a soft delete.** The content stays retrievable by id but is excluded
  from future searches. Use it when something is wrong or outdated, rather than
  adding a contradicting memory on top.
- **Never store a secret.** Memory is retrievable and displayable.
