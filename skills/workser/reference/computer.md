---
topic: computer
title: Workser Computer
summary: Start runs on this computer, steer them, stop them, collect artifacts.
commands: [computer]
---

# Workser Computer

`workser tool` puts your hands on the machine one call at a time.
`workser computer` starts **tasks** — a whole run with a planner, steps,
confirmations and artifacts — and gives you the run id to steer it with.

```
workser computer run "<task>"                     # start; prints the run id
workser computer run "<task>" --wait              # stream until done|failed|stopped|needs_user
workser computer run "<task>" -m background       # run headless, in parallel
workser computer status                           # active run, background runs, what needs you
workser computer list                             # conversations (also: runs, routines)
workser computer show <conversationId>            # messages, runs, artifacts (after a restart)
workser computer stop <runId>                     # also: stop active — safe to call twice
workser computer artifacts                        # what runs produced
workser computer artifacts get <id> -o <file>     # download one
workser computer confirm <confirmId> --allow      # answer a needs_user question (--deny, --answer)
workser computer routines                         # schedules and watches
```

## The modes, and who owns the choice

`--mode` defaults to **auto**: a foreground conversation the local app drives.
`interactive` is the same surface, said out loud; `background` runs headless in
parallel; `cloud` asks for a cloud run through the authenticated Core endpoint.
You are **requesting** a mode, not dictating one — the host's start response
names the owner, and later calls follow that, never a CLI-side guess. A host
that cannot serve a mode answers with an error envelope; do not retry the same
call against a different endpoint to work around it.

## What you get back

Everything answers `{"ok":true,"data":...}` (or `{"ok":false,"error":{...}}`) —
add `--json` and parse, never screen-scrape. `run` returns
`{conversationId, runId, status}`; the run id comes from the host's live event
feed, so on a slow host it may briefly be absent — `computer show` resolves it.
With `--wait` the same envelope gains `status: done|failed|stopped` and a
`summary`; exit 0, 1 and — when the run is blocked on the user — 5 with a
`confirm` payload the caller answers via `computer confirm`.

## Notes that matter

- **State is the host's, not the CLI's.** A CLI restart loses nothing: `status`
  and `show` re-read the run. Resume by conversation id, not by memory of what
  you saw last time.
- **`stop` is idempotent.** Calling it on a run that already ended answers
  `{stopped: false}` with exit 0 — treat that as success, not an error.
- **Cross-project is refused.** The daemon scopes `computer` to the folder
  you are standing in, like every other `/v1/*` route. `error.code =
  "out_of_scope"` (exit 7) means you are standing outside the project.
- **One screen, one foreground run.** A second foreground message returns 409
  while a task is on the screen — run it with `-m background` instead of
  retrying the foreground send.
- **This needs the Workser app running** (the engine lives in the desktop).
  `error.code = "not_connected"` (exit 4) means no daemon is listening — open
  Workser and retry. Commands that only read (status, list, artifacts) still
  answer machine-readably when the engine is configured but idle.
