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
```

Returns the generated image's public URL, so the usual move is to generate, then use
that URL directly in the app.

```bash
workser image generate "flat illustration of a farm delivery van, brand colors" --json
workser image gen "same van, from the side" -r https://… -o ./public/van.png --json
```

## Notes that matter (generation)

- **Reference images are image-to-image conditioning**, not attachments. Up to 4;
  anything beyond that is dropped.
- **The model sometimes narrates instead of drawing** — a refusal or a clarifying
  question comes back as text rather than an image. Check that you actually got an
  image before wiring the URL into a page; an empty result is not a transport error
  to retry.
- **`--output` writes only the first image.** If you asked for several, the rest
  exist only as URLs.
- **Placeholder art is not a deliverable.** Generating a hero image to unblock a
  layout is fine; shipping it as the user's brand asset without asking is not.

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
