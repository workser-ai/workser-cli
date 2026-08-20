---
topic: api
title: Services — calling one, and describing it
summary: Call this project's API through the same console the owner sees, and make sure every route it serves is written down before you call the task done.
commands: [api]
---

# Services — calling one, and describing it

A service has no screen. Everything else you build can be looked at; an API can
only be *called* — so unless the calls go somewhere the owner can see, "the API
works" is an assertion with nothing behind it.

```
workser api list  [--app <webAppId>]
workser api call <path> [--app <id>] [--method <verb>] [--body <text>]
                        [--header 'Name: value'] [--env local|preview|production]
workser api spec  [--check]
```

## Call it through the console, not through curl

`workser api call` goes through the same request console the owner has open. The
status, the timing and the body you see are the ones they see, and the
credentials come from the app's own environment rather than from your command
line — so a token never lands in a transcript.

```
workser api call /orders --app <id> --json
workser api call /orders --app <id> --method POST --body '{"item":"latte"}' --json
```

`--env` picks which copy to call. `local` is the dev server on this machine and
is the default; `preview` and `production` are the deployments. The host always
comes from that choice — a path is a path, never a URL, and passing one is
refused.

Exit code: non-zero only when nothing answered. A 404 or a 422 is a *successful*
call with an informative answer, so checking that a route correctly rejects bad
input works exactly as you would expect.

## Save the calls that matter

Requests saved at `api/requests.json` in the service's repo show up in the
owner's console. Write the handful that describe what the service does — not a
test suite:

```json
[
  { "id": "list-orders", "name": "List today's orders", "method": "GET",
    "path": "/api/orders", "note": "What the shop screen loads." },
  { "id": "place-order", "name": "Place an order", "method": "POST",
    "path": "/api/orders", "body": "{\"item\":\"latte\"}" }
]
```

They are in the repo on purpose: a call worth saving outlives the session that
saved it, and it shows up in the diff.

## Describe every route before you call it done

```
workser api spec --check
```

It compares the routes the repo actually serves — read from the file layout, so
it cannot be fooled by a comment — with the paths your OpenAPI document
declares, and fails when one is missing. Write the document at
`api/openapi.json` (YAML also works).

It is not an OpenAPI validator and does not check schemas or responses. It asks
one question, so that it is cheap enough to run every time: is every route
written down. A health probe is exempt. A path in the spec that the repo does
not serve is reported but does not fail — you may be documenting something
built next.

Run it alongside `workser verify` before declaring an API task finished. An API
somebody can call and an API somebody can integrate with are different products,
and the spec is the difference.
