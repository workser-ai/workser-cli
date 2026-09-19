---
topic: code
title: Workser Code
summary: Submit a build to the project's coding agent, follow it, fetch its artifacts.
commands: [code]
---

# Workser Code

`workser code` hands a requirement to this project's coding agent — the same
durable task the desktop's task page renders — and follows it from outside:

```
workser code run "<requirements>"            # submit; prints the run id
workser code run "<requirements>" --wait     # follow until it is done, then print results
workser code run "<r>" --app <id> --autonomy auto
workser code status <runId>                  # durable status, survives a CLI restart
workser code cancel <runId>                  # ask the daemon to stop it
workser code artifacts <runId>               # artifacts, preview URL, git revision
```

## What you get back

Every subcommand answers `{"ok":true,"data":…}` with `--json`. `run` returns
`{taskId, runId, status: "starting"}` immediately; `--wait` polls the durable
status and ends with the results envelope — the run's preview URL, its
artifacts, and the managed-git revision the work landed in. A run that ends
failed or cancelled still answers machine-readably; exit code 1 says so.

## Notes that matter

- **You never handle credentials.** The daemon executes Workser Code with the
  app's own authority; the CLI only names a project, an app and requirements.
  Do not look for a key — there is not one to have.
- **The workspace is where you are standing.** `run` submits this folder's cwd,
  which the daemon verifies is inside the pinned project — `out_of_scope`
  (exit 7) means you are standing outside it. Pass `--cwd` to name another
  folder inside the same project.
- **The run is durable.** `status` and `artifacts` re-read the task after this
  CLI process is gone; a reconnecting agent needs only the run id.
- **`cancel` is a request, not a promise.** It answers `cancelling`; confirm
  the terminal state with `status` before claiming the run is stopped.
- **Needs the Workser app running** — the capability lives in the desktop.
  `not_connected` (exit 4) means no daemon is listening; open Workser, retry.
- Keep the existing `workser agent` / `workser workflow` commands for what
  they already do; `code` does not replace them, it is the Computer-scoped
  path.
