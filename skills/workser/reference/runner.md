---
topic: runner
title: Workser runner
summary: Run a Workser job on this machine, or hand its token to another one, and follow it live.
commands: [run, runner]
---

# Workser runner

A Workser job runs wherever a **runner** is: this desktop, an E2B sandbox, the
project's cloud computer. The runner holds a token for that ONE run, reports
every step to Workser, and hears stops and answers from any screen.

```
workser run <runId> --start                  # run it here, and follow it live
workser run <runId> --start --workdir ./app  # in this folder
workser run <runId> --token-file ./run.env   # run it elsewhere: token goes to a 0600 file
workser run <runId> --start --no-follow      # start it, don't print the stream
workser runner --run <runId> --workdir .     # start the runner yourself (token in WORKSER_RUNNER_TOKEN)
```

- `workser run` needs cloud mode (an API key), because it talks to Workser
  directly: `--endpoint https://api.workser.ai --token <key>`.
- The run token is **never printed**. `--start` passes it to the runner's
  environment; `--token-file` writes `WORKSER_RUNNER_TOKEN=…` to a file only
  you can read. `workser runner --token` is refused.
- The runner program is `workser-runner` (package `@workser/runner`); set
  `WORKSER_RUNNER_BIN` to use another path.
- Stopping the command (Ctrl-C) stops the runner, which ends the run as
  cancelled (`runner_stopped`) after sending everything it has.
