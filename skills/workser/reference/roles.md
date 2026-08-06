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
workser agent list                  # main agent + configured roles + which agents are connected
workser agent run <role> "<task>"   # delegate to a CONFIGURED role (runs isolated)
workser agent spawn <agent> "<task>" [--role <label>] [--instructions <text>] [--model <model>]
                                     # spin up a TEMPORARY teammate on any connected agent CLI
workser agent main                  # show the configured main agent
```

## How to use it

Run `workser agent list --json` first — it tells you which roles exist, which are
actually runnable on this machine, and which agent CLIs are connected at all
(`spawnable`). Delegating to a role that isn't installed, or spawning an agent that
isn't connected, just fails.

`workser agent run <role> "<task>" --json` runs a **configured** role as an isolated
local subagent and returns `{role, agent, output, exitCode}`.

`workser agent spawn <agent> "<task>" --json` does the same thing without a
pre-configured role — `<agent>` is one of `claude_code|codex|kimi|opencode|grok`, any
of which can be connected on this machine. Use it to fan work out in parallel for
one-off work with no matching role: e.g. spawn `codex` to research a topic while you
keep working, or run a second `claude_code` instance on a different part of the same
task. `--instructions` sets that teammate's system prompt for this one run — give it
real scope, not just a repeat of the task.

- Hand off focused subtasks — review this diff, design this screen, research this API —
  to keep your own context lean and get a specialized second perspective.
- **A non-zero `exitCode` means the run failed.** Surface that; don't quietly treat
  empty output as success.
- The subagent doesn't share your context, configured role or spawned. Put everything
  it needs in the task string (and `--instructions` for a spawn); it cannot see the
  conversation you're in.
- Never give a subagent — configured or spawned — a task that tells it to delegate or
  spawn further. It has no supervision loop to stop a runaway chain.
