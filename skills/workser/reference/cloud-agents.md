---
topic: cloud-agents
title: Ship an agent inside the app
summary: Create an AI agent that runs on Workser and can be called from this project's apps.
commands: [cloud-agent]
---

# Ship an agent inside the app

`workser cloud-agent` creates an AI agent that runs on **Workser's**
infrastructure, keeps its own memory and tools, and can be called from the web,
mobile, API or Python apps in this project.

**This is not `workser agent`.** That one hands a subtask to a coding agent on
this machine — a teammate helping you build. This one is a thing the project
*ships*: it works for the user after you are gone.

```
workser cloud-agent list
workser cloud-agent create "Order desk" --instructions "..."
workser cloud-agent show <agentId>
workser cloud-agent run <agentId> "<what to do>"
workser cloud-agent runs <agentId>        # recent runs
workser cloud-agent runs <runId>          # one run, with what it cost
```

Every call is scoped to the project this folder belongs to.

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
   what you abandon: `workser cloud-agent runs <runId>` shows the cost.

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
