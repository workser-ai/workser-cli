---
topic: agent-triggers
title: What starts an Agent Cloud agent
summary: Schedules, chat channels and app events — a trigger works the moment it is saved, unlike everything else on an agent.
commands: []
---

# What starts an Agent Cloud agent

A published agent runs when somebody asks it to and at no other time. A trigger
is what makes it start on its own — a time, a chat message, or an event in a
connected app.

```
workser agent-cloud triggers <id>                       # what starts it today
workser agent-cloud trigger-add <id> schedule cron="0 9 * * 1-5" name="Morning report"
workser agent-cloud trigger-add <id> chat app_type=line
workser agent-cloud trigger-add <id> app_event event_type=GMAIL_NEW_GMAIL_MESSAGE connected_account_id=<id>
workser agent-cloud trigger-setup <id> <triggerId>      # the webhook URL to paste
workser agent-cloud trigger-events <id>                 # what fired, and what it started
workser agent-cloud trigger-remove <id> <triggerId>
```

**A trigger works the moment it is saved** — unlike everything above, it is not
part of the agent's version and does not wait for a publish.

`rule=` is optional and is the FIRING rule, not the agent's instructions:
`rule="only when the message mentions an order"`. Leave it empty on a chat
channel and every message reaches the agent, which is what a support agent
wants — the agent decides what to do with each one.

For a chat trigger, **`trigger-setup` is not optional**: it returns the webhook
URL to paste into LINE's or Slack's console, and it says whether anything has
arrived yet. Without that step the trigger sits there looking finished and
never receives anything.

To let the agent ANSWER on that channel, the project also needs the account
connected — `workser line connect --token …`. See `workser help chat-channels`.

## The two halves of a chat agent

Receiving and answering are separate, and each has its own setup:

| | What it does | How |
| --- | --- | --- |
| The trigger | a message STARTS the agent | `trigger-add <id> chat app_type=line`, then `trigger-setup` |
| The connection | the agent can ANSWER | `workser line connect --token …` |

Do only the first and the agent listens and never speaks. Do only the second and
nothing ever wakes it up.

With both in place, a run started by a message is handed the reply token and the
sender, and gets every operation of that account as a tool — `line_reply`,
`slack_send_message` and the rest. Sends go through the agent's approval gate;
reads do not.

## Schedules, in plain words

`cron=` takes a standard five-field expression. The four people ask for:

```
cron="0 9 * * 1-5"    every weekday at 9am
cron="0 9 * * *"      every day at 9am
cron="0 * * * *"      every hour
cron="0 9 * * 1"      every Monday at 9am
```

`timezone=` defaults to UTC, which is almost never what somebody means by "9am".
Set it: `timezone="Asia/Bangkok"`.
