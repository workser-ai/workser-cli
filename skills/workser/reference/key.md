---
topic: key
title: Managed keys — list and rotate this app's Workser-issued credentials
summary: See this app's AI Gateway and auth keys (redacted), and rotate one without opening Orbit.
commands: [key]
---

# Managed keys — list and rotate this app's Workser-issued credentials

```
workser key list [--app <webAppId>]
workser key rotate <key> [--app <webAppId>] [--env production|preview]
```

App-scoped, not project-scoped: run from the app's own folder and `--app` is
picked up automatically; from anywhere else, pass `--app <webAppId>` — a
mistake here is the wrong app's key, so there is no "primary app" default the
way `env` has one.

## What's rotatable

Only credentials with a real rotation handler:

- `AI_GATEWAY_API_KEY` — the deployed agent's key into the Workser AI
  Gateway. Split by environment (`--env production` or `--env preview`
  required), so rotating one never touches the other.
- `BETTER_AUTH_SECRET` — a single value, no `--env` needed.

Every other Workser-managed value (`DATABASE_URL`, the internal service
keys) has no rotation handler yet — each belongs to a different subsystem
with its own cutover semantics, and `key rotate` refuses rather than fake
one.

## After rotating

The old value stops authorizing immediately, server-side. An already-running
deployment keeps using whatever it was built with until it's redeployed —
run `workser deploy` (`--prod` for the production key) to pick up the new
value. `key rotate` prints the new secret exactly once; it is never shown
again or stored anywhere in the clear.
