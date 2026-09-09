---
topic: line
title: LINE Official Account
summary: Connect a LINE OA once, then send, reply, broadcast, build rich menus and read insight — from the CLI or from an agent.
commands: [line]
---

# LINE Official Account

Connect the business's LINE account to this project **once**. After that the same
account is reachable from here, from Workser Code, and from any Agent Cloud agent
in this project — including the one a LINE message starts.

```
workser line status                          # is anything connected?
workser line connect --token <channelAccessToken> [--secret <channelSecret>]
workser line verify                          # ask LINE if the token still works
workser line disconnect

workser line ops [--group messaging|richmenu|audience|insight|people|group|quota|content|account]
workser line call <operation> --params '<json>'   # any of the 70 operations

workser line send <to> "<text>"              # push to a user, group or room id
workser line reply <replyToken> "<text>"     # answer a message — free, single-use
workser line broadcast "<text>"              # EVERY follower, one message each
workser line quota                           # allowance left this month
workser line profile <userId>
```

## Getting the token

LINE Developers console → your Messaging API channel → **Messaging API** tab →
*Channel access token* (long-lived). `--secret` is the **Basic settings** →
*Channel secret*, and is only needed if you want LINE's own signature check on
incoming webhooks.

`connect` calls LINE immediately to prove the token works, so a mistyped token
fails here rather than an hour later as a customer message nobody answered.

## `call` is the whole API

`ops` prints every operation with a one-line summary. The `●` marks the ones that
send something, spend quota, or change the account.

```
workser line call push --params '{"to":"U4af…","messages":[{"type":"text","text":"Your order shipped"}]}'
workser line call richmenu_list
workser line call insight_followers --params '{"date":"20260909"}'
workser line call webhook_endpoint_set --params '{"endpoint":"https://…"}'
```

Parameters are flat — path, query and body fields all go in `--params` together and
the server sorts them. Fields it has never heard of are **forwarded to LINE
untouched**, so a flex component LINE shipped last week works today.

## Reply beats push

`reply` uses the token that came with the incoming message. It is **free** and does
not touch the monthly quota; `push` costs one message per recipient. The token is
single-use and expires within a minute or so, so reply first and fall back to push.

`broadcast` sends to every follower and spends one message each. On a large account
that is the most expensive call in the list — say what it will cost before running it.

## Rich menus, in order

A rich menu does nothing until it has both a picture and a place to appear:

1. `richmenu_create` — the layout and tappable areas. Returns an id.
2. `richmenu_upload_image` — `content` is the file **base64-encoded**, with
   `content_type`. The image must match the declared size exactly.
3. `richmenu_set_default` (everybody) or `richmenu_link_user` (one person).

`richmenu_validate` checks a layout without creating it.

## When it is an agent doing this

An Agent Cloud agent in a project with a connected LINE account gets these as tools
automatically — there is nothing to bind. Sends go through the agent's approval gate;
reads do not. See `workser help agent-cloud`.
