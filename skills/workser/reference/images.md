---
topic: images
title: Image generation & media understanding
summary: Generate images from a prompt; describe/transcribe an image, video, or audio clip you can't natively see or hear.
commands: [image, video, audio]
---

# Image generation & media understanding

```
workser image generate "<prompt>"            # alias: workser image gen
  -r, --reference <url...>                   # condition on existing images (up to 4)
  -o, --output <path>                        # also download the first image locally
workser image usage                          # can I generate right now, and what would stop me
```

Returns the generated image's public URL, so the usual move is to generate, then use
that URL directly in the app.

```bash
workser image generate "flat illustration of a farm delivery van, brand colors" --json
workser image gen "same van, from the side" -r https://… --json     # use .data.url
workser image gen "van, rear view" -o /tmp/van.png --json           # only if you must
```

## Notes that matter (generation)

- **Reference images are image-to-image conditioning**, not attachments. Up to 4;
  anything beyond that is dropped.
- **The model sometimes narrates instead of drawing** — a refusal or a clarifying
  question comes back as text rather than an image. Check that you actually got an
  image before wiring the URL into a page; an empty result is not a transport error
  to retry.
- **The URL is the deliverable — don't download it into the app folder.** This
  example used to write to `./public/van.png`, which is the single most common way
  generated art ends up committed to the user's repository: in every deploy bundle
  for ever, unreplaceable without a redeploy, against a 25MB publish cap. The
  returned URL is already public and already served. Reference it.

  When a file genuinely has to exist — an asset the build reads, something to hand
  the user — `-o` into a temp path and `workser storage put` it into the bucket
  (or whatever store the owner chose; the repo is never it). See
  `reference/storage.md`.
- **`--output` writes only the first image.** If you asked for several, the rest
  exist only as URLs.
- **Placeholder art is not a deliverable.** Generating a hero image to unblock a
  layout is fine; shipping it as the user's brand asset without asking is not.

## This is metered, and it can be refused

Every image is billed to the organization's credit wallet, and each plan includes
a monthly number of them. Three gates run server-side before anything is drawn —
the plan tier, the monthly allowance, then the wallet — so a call can come back
refused having spent nothing.

```bash
workser image usage --json    # {"limit":10,"used":3,"remaining":7,
                              #  "credits":{"available":41.2,"requiredPerImage":4.12,"sufficient":true},
                              #  "canGenerate":true,"blockedBy":null}
```

- **Check before a batch, not after.** Planning six images is a plan that needs
  six times `requiredPerImage` in the wallet. `workser image usage` answers that
  before any of them cost anything; `blockedBy` names which gate would stop you
  (`plan`, `quota`, `credits`), and it exits non-zero when generation is blocked.
- **A refusal is final, not a hiccup — do NOT retry it.** `insufficient_credits`
  (HTTP 402) and `image_quota_reached` (403) come back as those exact codes in
  `--json`, and the CLI exits 8 for both. Retrying cannot succeed and every
  attempt is another paid call the owner did not ask for. Stop, and tell the
  owner what to do: top up credits, or upgrade the plan.
- **You cannot see their balance any other way**, so do not guess at it from how
  many images you have already made — a refusal at image four of six leaves the
  work half-done and looks like a bug.

## Understanding media you can't natively see or hear

The fallback for a text-only model, or media you have no other way to reach: describe
an image, summarize/transcribe a video, transcribe/describe audio. Runs server-side
(Gemini) — you never need a model key.

```
workser image understand "<query>" [--url <u> | --file <p>] [-t <task>]
workser video understand "<query>" [--url <u> | --file <p>] [-t <task>]
workser audio understand "<query>" [--url <u> | --file <p>] [-t <task>]
```

```bash
workser image understand "what's wrong with this layout?" --url https://…/screenshot.png --json
workser video understand "what happens at the end?" --url https://youtu.be/… -t timestamp_analysis --json
workser audio understand "transcribe this" --file ./voicemail.m4a -t transcribe --json
```

## Notes that matter (understanding)

- **`--url` vs `--file`**: `--url` is fetched server-side with no size ceiling — the
  right choice for anything already hosted (a project's own storage bucket, a public
  link, a YouTube URL for video/audio). `--file` is read and sent inline by the CLI
  itself, so it's bounded by the daemon's own request-size limit — for a small local
  file only (a screenshot, a short voice memo). Something bigger: `workser storage
  upload` it first, then pass the returned URL with `--url`.
- **`-t/--task` shapes the answer, it doesn't gate what you can ask** — `general` (the
  default) takes any free-form `<query>`. The other values just bias the prompt
  toward a specific shape: `caption`/`visual_qa`/`object_detection`/`segmentation`
  for images; `summarize`/`describe`/`visual_qa`/`timestamp_analysis` for video;
  `transcribe`/`describe`/`audio_qa`/`speaker_diarization`/`emotion_detection` for
  audio.
- **This is billed to the project's organization**, same as image generation — it's
  a real provider call, not free introspection. Don't loop it over every file in a
  folder "just in case"; use it when you actually need to know what's in one.
