---
topic: images
title: Image generation
summary: Generate images from a prompt, optionally conditioned on existing images.
commands: [image]
---

# Image generation

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

## Notes that matter

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
