---
topic: computer-use
title: Computer-use tools
summary: Files, shell, screen, input, clipboard and browser on this machine.
commands: [tool]
---

# Computer-use tools — your hands on this machine

```
workser tool list                        # what's available to you right now
workser tool run <name> [--body <json>]  # run one
```

`workser tool list` shows what's available — filesystem (read/write/list/delete/move),
shell (run a command / Python / Node), screenshots and screen info, mouse and keyboard
input, clipboard, notifications, and basic browser control (open a URL, read the page,
click, fill, type, screenshot).

This is the **same engine** Workser's cloud Computer Use agent uses when it controls a
user's machine remotely — you're getting it locally, gated by the same safety policy.

## Notes that matter

- **Check `tool list` rather than assuming a capability exists.** This is a curated
  subset, not full desktop automation.
- **The safety policy applies.** Blocked paths (`~/.ssh` and friends), blocked
  destructive commands, rate limits. Refusals are the policy working, not a bug to
  route around.
- **Sensitive actions are approval-gated.** Writing or deleting files, running a shell
  command, clicking or typing may return `awaiting_approval` (exit 5) — this is
  usually an unattended run, so nobody is necessarily watching for it. Say plainly
  that it needs approval in Orbit and **stop this turn**. Never write a retry loop,
  a polling script, or a sleep-and-recheck command around it — that spends the whole
  run spin-waiting on a click and will simply time out. The same command works on
  its own, the next time it runs, once approved.
- **You already have your own tools.** For editing files in this repo, use them. Reach
  for `workser tool` when you need something *outside* the project — the screen, the
  clipboard, a browser, another app on the machine.
