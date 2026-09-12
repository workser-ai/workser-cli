---
topic: agent-cloud-api-calls
title: Giving an agent an API to call
summary: Turn any HTTP call into a tool an agent can use — including calls to the customer's own Workser account, with no key for anybody to handle.
commands: [agent-cloud]
---

# Giving an agent an API to call

A connected app covers products somebody curated; an MCP server covers ones
somebody published. Neither exists for the service the business built itself,
and that is most in-house APIs. `add <id> api` writes the call down once and the
agent gets a named tool with the description you give it.

```
workser agent-cloud add <id> api name=check_stock \
  description="Look up how many of a product are in the warehouse, by SKU. Read-only." \
  url="https://api.acme.com/stock/{sku}" \
  params="sku:The product code, e.g. WID-9" \
  auth_type=header auth_env_key=ACME_KEY auth_header_name=X-Api-Key

workser agent-cloud get <id> api            # what it can call
workser agent-cloud remove <id> api <itemId>
```

## The description is the whole feature

It is the only thing the agent reads when deciding whether this is the right
call. A blank one gives you a call that is perfectly configured and never used —
the most expensive kind of broken, because everything looks finished. Write what
somebody would say out loud, and say whether it is read-only.

`params` is a name and a one-line description each, comma separated. Anything you
do not list there, the agent cannot send. A `{placeholder}` in the address is
filled from the parameter of the same name; everything else goes in the query on
a GET and the body otherwise.

## No credential ever goes on the call

`auth_env_key` names a Secret you added with `add <id> secret`. The value stays
there and is injected per run, and the agent never sees it — the credential is
attached after the agent has chosen the arguments and before the request goes
out. Put a token in the address or in a header and the API refuses the whole
thing rather than storing it.

Anything the credential touched is stripped out of errors and response bodies
before the agent reads them, because plenty of APIs echo the key they were sent
in a 401.

## Calling Workser itself, with no key at all

`auth_type=workser_service` is the one to reach for when the call is to the
customer's own Workser account — their business records, their project database,
their storage, their workflows:

```
workser agent-cloud add <id> api name=list_orders \
  description="Recent orders for this business, newest first." \
  url="https://api.workser.ai/v1/business/orders" \
  auth_type=workser_service auth_scopes=business:read
```

There is no key to create, paste, rotate or leak. Workser issues access for each
run, scoped to exactly the `auth_scopes` you name, pinned to that one agent, and
expiring on its own. Nothing is stored on the call, and nothing passes through
your terminal, your shell history or the repo — which is where a copied API key
usually ends up.

Ask for the narrowest scope that does the job. `secrets:read`, `secrets:write`
and `keys:manage` are refused outright: an agent that could read every stored
credential, or mint itself a wider key, would make the rest of this pointless.

## Say when a call changes something

`is_write=true` for anything that writes, sends, charges, cancels or posts. It is
declared rather than guessed from the method, and deliberately: a POST to a
search endpoint changes nothing, and a GET that cancels an order changes
everything, so reading the verb puts approvals on the wrong calls in both
directions. A write is held behind the same approval the agent's other writes
are.

## Things that will bite you

- **It must be https, and it must be public.** A private, loopback or
  `.internal` address is refused when you save it, and refused again when the
  call is made — a name that resolves publicly today can resolve to the cloud
  metadata endpoint tomorrow.
- **A `workser_service` call must address Workser**, not merely be allowed a
  private one. It gets a real credential attached, so it will only ever go to
  Workser's own API host. Point one anywhere else and it is refused at both
  ends, and nothing is sent.
- **Redirects are not followed.** If the API answers 301, point the call at the
  final address; following one would hand the address check back to whoever
  controls the server.
- **Nothing is live until you publish.** `workser agent-cloud publish <id>`.
- **A Secret has to exist first.** Naming one that does not is refused when you
  save, not silently at run time — which is the difference between an error you
  can fix and a 401 an agent reports as "the API rejected me".
