---
topic: search
title: Web search
summary: Google-grounded web search, run server-side — the API key never reaches you.
commands: [search]
---

# Web search — ask the internet, not just the model

```
workser search "<query>" [-n, --max-results <n>]   # Google-grounded web search
```

## Why this exists

A local agent can drive a browser, but it can't "search the web" without a URL
already in hand — `browser` automation needs somewhere to point. This runs a
real, grounded Google search server-side (core-api holds the API key; it never
reaches the daemon, the CLI, or you) and returns a synthesized answer plus the
source links behind it.

## Using it well

- Prefer this over guessing or asking the user when you need current facts,
  prices, docs for a library, or anything time-sensitive.
- The `answer` is a synthesized summary — the `results` list is the sources it
  drew from. Cite or open one of those links if the user needs to verify the
  claim themselves.
- Not project-scoped: it's a general research tool, not tied to a project's data.
