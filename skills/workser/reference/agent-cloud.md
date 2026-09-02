---
topic: agent-cloud
title: Ship an agent inside the app
summary: Create an AI agent that runs on Workser and can be called from this project's apps.
commands: [agent-cloud]
---

# Ship an agent inside the app

`workser agent-cloud` creates an AI agent that runs on **Workser's**
infrastructure, keeps its own memory and tools, and can be called from the web,
mobile, API or Python apps in this project.

**This is not `workser agent`.** That one hands a subtask to a coding agent on
this machine — a teammate helping you build. This one is a thing the project
*ships*: it works for the user after you are gone.

```
workser agent-cloud list
workser agent-cloud create "Order desk" --instructions "..."
workser agent-cloud show <agentId>
workser agent-cloud run <agentId> "<what to do>"
workser agent-cloud runs <agentId>        # recent runs
workser agent-cloud runs <runId>          # one run, with what it cost
```

Every call is scoped to the project this folder belongs to.

## Creating one is not finishing one

An agent created with a name and a sentence knows nothing about the business.
Teaching it is the actual work, and it is all here:

```
workser agent-cloud set <id> system_prompt="..." handle="orderdesk"
workser agent-cloud add <id> skill name="Refunds" instructions_md="..."
workser agent-cloud add <id> knowledge name="Price list" content_text="..."
workser agent-cloud add <id> tool display_name="Send email" provider="gmail" \
                             provider_tool_id="GMAIL_SEND_EMAIL"
workser agent-cloud add <id> secret key="STRIPE_KEY" value="..."
workser agent-cloud add <id> subagent subagent_id=<otherId> name="researcher"
workser agent-cloud get <id> skill          # what it has
workser agent-cloud remove <id> skill <itemId>
```

`add` takes `key=value` pairs and REFUSES a field it does not know, rather than
sending it. That matters: the API silently drops unknown fields, so a typo
would otherwise be accepted, dropped, and reported as success — leaving an
agent that had been told nothing.

## Nothing takes effect until you publish

**This is the step to not forget.** The runtime resolves the PUBLISHED version
of an agent and never the draft, so every `set` and `add` above is inert until:

```
workser agent-cloud publish <id> --note "taught it refunds"
```

Before publishing, try the setup without putting it live:

```
workser agent-cloud try <id> "a customer wants a refund on order 1042"
```

A `try` runs the draft, costs the same as a real run, and changes nothing that
customers can reach.

## Choosing how it thinks and what it runs on

```
workser agent-cloud models            # cheapest first, on Workser credit
workser agent-cloud models --all      # includes ones needing your own key
workser agent-cloud set <id> default_provider=openrouter default_model=...

workser agent-cloud machines          # video, data analysis, design, ...
```

A model marked "needs your own key" will make `publish` FAIL unless a matching
secret is stored first. Add the key with `add <id> secret` before setting it.

## When to reach for this

When the user describes a job that **keeps happening** and needs judgement:
"check every order for stock and email me the problems", "read the LINE
messages and file them", "reconcile these invoices". That is an agent.

A one-off transformation is not an agent — write the code. A fixed sequence of
steps with no judgement in it is not an agent either — that is `workser
workflow`.

## Calling it from the app you are building

Do NOT shell out to the CLI from app code. Use the SDK, which streams:

```ts
import { workser } from '@workser/app';

const run = await workser.agents.run(agentId, { message }, {
  referenceUserId: user.id,   // who it is acting for
});

for await (const event of workser.agents.stream(run.id)) {
  // event.type, event.data — forward these to the browser
}
```

`stream()` reconnects itself through dropped connections, so the person
watching sees the agent think. See the `workser-sdk` skill, `reference/agents.md`.

## Things that will bite you

1. **A run costs money by the minute.** It is metered — runtime, workspace, and
   a per-run fee — so a loop that starts agents is a loop that spends. Cancel
   what you abandon: `workser agent-cloud runs <runId>` shows the cost.

2. **Instructions are the product.** The agent does what its instructions say,
   in the user's own words. Write them the way you would brief a new colleague:
   what to do, what to leave alone, when to ask. Vague instructions are the
   single biggest cause of an agent that "doesn't work".

3. **Free plans cannot run agents at all**, and a trial has a small allowance.
   A `402` with `spend_limit_reached` is not a bug — tell the user what it says
   and point them at their plan.

4. **Say who it is for.** An agent acting for one of the app's customers needs
   `referenceUserId`, or its memory and audit trail belong to nobody.

5. **Do not invent an agent the user did not ask for.** Creating one is cheap;
   an agent nobody wanted, quietly costing money per run, is not.
