---
topic: chat-channels
title: LINE, Telegram, Discord, Slack
summary: Connect a chat account once, then send, reply and read from the CLI or from an agent — LINE gets its whole Messaging API.
commands: [line, telegram, discord, slack]
---

# LINE, Telegram, Discord, Slack

Connect the business's chat account to this project **once**. After that it is
reachable from here, from Workser Code, and from any Agent Cloud agent in this
project — including the one a chat message starts.

Every provider takes the same six verbs:

```
workser <provider> status                       # is anything connected?
workser <provider> connect --token <token>
workser <provider> verify                       # does the credential still work?
workser <provider> disconnect
workser <provider> ops [--group <name>]         # everything it can do
workser <provider> call <operation> --params '<json>'
```

where `<provider>` is `line`, `telegram`, `discord` or `slack`.

## Getting the token

| Provider | Where | Flag |
| --- | --- | --- |
| LINE | Developers console → Messaging API → Channel access token | `--token`, plus `--secret` for the channel secret |
| Telegram | @BotFather → `/newbot` or `/token` | `--token` |
| Discord | Developer Portal → your app → Bot → Reset Token | `--token` (the bot must also be invited to the server) |
| Slack | Your app → OAuth & Permissions → Bot User OAuth Token (`xoxb-`) | `--token`, plus `--signing-secret` |

`connect` calls the provider immediately to prove the credential works, so a
mistyped token fails right there instead of an hour later as a customer message
nobody answered.

## `call` is the whole API

`ops` prints every operation with a one-line summary. The `●` marks the ones
that send something, spend quota, or change the account.

```
workser line call push --params '{"to":"U4af…","messages":[{"type":"text","text":"Your order shipped"}]}'
workser line call richmenu_list
workser telegram call send_chat_action --params '{"chat_id":123,"action":"typing"}'
workser slack call list_conversations --params '{"types":"public_channel"}'
workser discord call create_thread --params '{"channel_id":"…","message_id":"…","name":"Order #4021"}'
```

Parameters are flat — path, query and body fields all go in `--params` together
and the server sorts them. Fields it has never heard of are **forwarded
untouched**, so a flex component or a Slack block the vendor shipped last week
works today.

## Shortcuts

```
workser line send <to> "<text>" | reply <replyToken> "<text>" | broadcast "<text>"
workser line quota | profile <userId>
workser telegram send <chatId> "<text>"
workser discord send <channelId> "<text>"
workser slack send <channel> "<text>"
```

## Reply beats push, on LINE

`reply` uses the token that came with the incoming message. It is **free** and
does not touch the monthly quota; `push` costs one message per recipient. The
token is single-use and expires within a minute or so, so reply first and fall
back to push.

`broadcast` sends to every follower and spends one message each. On a large
account that is the most expensive call available — say what it will cost
before running it.

## How complete each one is

**LINE is the deep one** — its entire Messaging API, about seventy operations:
messaging, rich menus, audiences and narrowcast, insight, quota, content,
groups and rooms, and the webhook endpoint itself.

**Telegram, Discord and Slack carry what a chat agent needs** — send, reply,
edit, delete, react, typing indicator, threads and DMs, plus reading people and
conversations. Not their whole APIs. `ops` is the truth; ask it rather than
assuming an operation exists.

## Rich menus, in order (LINE)

A rich menu does nothing until it has both a picture and a place to appear:

1. `richmenu_create` — the layout and tappable areas. Returns an id.
2. `richmenu_upload_image` — `content` is the file **base64-encoded**, with
   `content_type`. The image must match the declared size exactly.
3. `richmenu_set_default` (everybody) or `richmenu_link_user` (one person).

`richmenu_validate` checks a layout without creating it.

## When it is an agent doing this

An Agent Cloud agent in a project with a connected account gets these as tools
automatically — there is nothing to bind, and no capability to switch on. Sends
go through the agent's approval gate; reads do not. See
`workser help agent-cloud`.
