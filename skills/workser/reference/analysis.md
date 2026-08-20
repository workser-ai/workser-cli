---
topic: analysis
title: Analysis — running Python on this project's data
summary: Run pandas locally under a sandbox and a clock, so the code, the output and the timing land in the task where the owner can see them.
commands: [analysis]
---

# Analysis — running Python on this project's data

```
workser analysis runtime [--app <webAppId>]
workser analysis run --app <webAppId> --file report.py [--timeout <ms>]
workser analysis run --app <webAppId> --code 'print(1)'
```

## Why not just run `python` yourself

Two reasons, and the second matters more.

It runs inside the same OS sandbox a structured agent run gets, scoped to the
app's own folder — so a script that goes wrong goes wrong in one directory.

And it is **recorded**. The code, the output and how long it took land in the
task, where the owner can see them. An analysis nobody can see is an assertion,
which is the same problem `workser api call` solves for a service with no
screen. If a number is going to end up in front of the customer, run it here.

## Check the runtime before you write the script

```
workser analysis runtime --app <id> --json
```

It reports the interpreter that would be used — the app's own `.venv` first, if
it has one — and whether `pandas` and `matplotlib` are importable. Exit code is
non-zero when Python is missing, so you find out in a second rather than after
writing a hundred lines.

## Limits, said plainly

Five minutes by default, fifteen at most. Output is capped per stream and
truncation is reported. Nothing is silently dropped.

These are local limits and they are the right ones: this work does **not** go in
a deployed function. `maxDuration` is for a slow request; an analysis reads a lot
of rows and takes as long as it takes, so putting it behind a serverless timeout
means the useful analyses are exactly the ones that fail.

## What counts as evidence

A number on its own is not a finding. When you report a result, say what the
query was, how many rows it covered, and what window of time — a figure with no
denominator is the easiest thing in this product to get wrong and the hardest
for the owner to check.
