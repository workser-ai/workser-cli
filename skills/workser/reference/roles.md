---
topic: roles
title: Delegate to roles
summary: Hand a focused subtask to another configured local agent.
commands: [agent]
---

# Delegate to roles

The user can configure **roles** — named specialists each backed by a local CLI agent
(e.g. `qa` → codex, `designer` → claude_code).

```
workser agent list                  # main agent + configured roles (+ which are runnable)
workser agent run <role> "<task>"   # delegate a focused subtask (runs isolated)
workser agent main                  # show the configured main agent
```

## How to use it

Run `workser agent list --json` first — it tells you which roles exist **and** which
are actually runnable on this machine. Delegating to a role that isn't installed just
fails.

`workser agent run <role> "<task>" --json` runs the role as an **isolated local
subagent** with its own context and returns `{role, agent, output, exitCode}`.

- Hand off focused subtasks — review this diff, design this screen — to keep your own
  context lean and get a specialized second perspective.
- **A non-zero `exitCode` means the role's run failed.** Surface that; don't quietly
  treat empty output as success.
- The subagent doesn't share your context. Put everything it needs in the task
  string; it cannot see the conversation you're in.
