---
topic: agent-cloud-media
title: Pictures, voice, video — and calling a model without an agent
summary: What an Agent Cloud agent can make and read, plus one-shot model calls from the app's own code.
commands: [agent-cloud]
---

# Pictures, voice, video — and calling a model without an agent

### Models that are not chat models

`models` used to list chat models and nothing else — not by choice, but
because the catalogue threw every other kind away before anyone could ask for
one. It no longer does:

```
workser agent-cloud models --kind image          # models that draw
workser agent-cloud models --kind video
workser agent-cloud models --kind speech         # text in, a voice out
workser agent-cloud models --kind transcription  # a voice in, text out
workser agent-cloud models --kind embedding      # for search by meaning
workser agent-cloud models --accepts image       # chat models that see photos
```

Prices are shown in the unit the model is SOLD in — `4.6 credits each` for a
picture, `credits/1M` for words. A picture quoted per million would be out by
six orders of magnitude.

`default_model` must stay a **chat model**. It is what the agent thinks with;
setting it to an image model publishes an agent that never answers anybody.
The other kinds are reached through abilities, below.

## What the agent can make, and what it can read

These are abilities on the agent, not models you set:

| Ability | The agent gains |
| --- | --- |
| `media_generation.image` | `generate_image` — answer with a picture, art for a post |
| `media_generation.audio.speech` | `generate_speech` — reply in voice |
| `media_generation.audio.sound_effects` | `generate_sound_effect` |
| `media_generation.audio.music` | `generate_music` — a background track |
| `media_generation.video` | `generate_video` — short clips |
| `perception.image` | `describe_image` — read a photo a customer sent |
| `perception.video` | `describe_video` |
| `perception.audio` | `transcribe_audio` — a voice note becomes text |

Turn on only what the job needs. **Video costs an order of magnitude more than
everything else here**, and it is refused outright on a deployment where an
operator has not priced it — that refusal is a configuration fact, not the
user's mistake, so relay it rather than retrying.

Everything these produce comes back as a **URL in the project's storage**, so
it can go straight into a reply, a post, or the next tool.

## When the app itself needs a model, not an agent

An agent is a sandbox, a tool loop, and minutes of metered runtime. Most of
what an app needs a model for is one call that takes a second: a product
description, a thumbnail, a spoken confirmation, search that understands
meaning. Starting an agent for those is the wrong shape and the wrong price.

Use `@workser/app` in the app's own code:

```ts
import { workser } from '@workser/app';

const blurb  = await workser.ai.text('Write a 40-word description of ' + name);
const art    = await workser.ai.image('product photo of ' + name);
const audio  = await workser.ai.speech('Your order is confirmed.');
const vector = await workser.ai.embed(descriptions);   // many in one call
for await (const word of workser.ai.stream(question)) process.stdout.write(word);
```

Nobody holds a provider key: Workser's own credential is used and the
organisation's credit ledger is charged, the same wallet an agent run draws on.
It needs no setup in a Workser-deployed app — the two environment variables are
injected at provisioning.

**The rule:** one answer goes to `workser.ai`; work that takes minutes and uses
tools goes to an agent.
