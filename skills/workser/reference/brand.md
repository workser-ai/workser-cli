---
topic: brand
title: The project's brand
summary: Read the owner's colours, fonts and logo before writing UI, and wire the generated design tokens into the app's theme.
commands: [design]
---

# The project's brand

```
workser design show [--raw]
```

The owner sets their brand once in Workser (logo, colours, fonts). Everything
you build should follow it. Read it **before writing any UI**:

```bash
workser design show --json
```

```json
{"ok":true,"data":{"hasBrand":true,
  "colors":{"primary":"#1f7a4d","accent":"#f5a623"},
  "fonts":{"heading":"Inter","body":"Inter"},
  "brand":{"name":"Green Grocer"},
  "files":["design/tokens.json","design/tokens.css"]}}
```

This asks the server, which derives the answer from the brand record itself — so
it is correct even if nothing has been written into the working tree yet. That's
the reason to use it instead of looking for a file and guessing when it's absent.

`"hasBrand": false` is an ordinary state — most projects have no brand set.
Choose sensible styling yourself; **don't** stop and ask the user to define a
brand first.

## Using it in the code

The same values are generated into the working tree as two files:

- `design/tokens.json` — the tokens in DTCG form
- `design/tokens.css` — plain CSS custom properties (`--ws-color-*`, `--ws-font-*`)

Wire `design/tokens.css` into the app's theme the way this app's setup expects —
it assumes no particular Tailwind version, so map it rather than pasting it.

**Both files are generated and overwritten wholesale.** Never hand-edit them;
your edit disappears on the next sync. `workser design show --raw` prints them
verbatim if you need to see exactly what's in them.

## Changing the brand is the owner's job

There is no `workser design set` — the brand is one record the owner controls in
the Workser app, and it drives everything generated from it. If the user asks you
to change their brand colour, tell them where it lives (Design → Brand in Orbit)
rather than writing the colour into the app by hand, which would drift from every
other surface the brand feeds.

For generating artwork *in* the brand's palette, see `workser help images` —
put the colours from `design show` into the prompt.

## The three places design lives — and which one you are in

They are separate on purpose, and confusing them is the commonest mistake here.

| What | Scope | Where |
| --- | --- | --- |
| **Brand** — colours, fonts, logo | The **project** | `business_settings`, read with `design show` |
| **Design files** — the `.fig` work | The **project**, many files | the project's design workspace folder |
| **Layout options** — choices to show the owner | **One app** | `design/options.json` in that app's folder |

**Design is not an app.** It has no port, no URL, nothing to deploy. Never create
an app for it.

When you write `design/options.json`, put the design file each option came from
in a `source` field:

```json
{ "options": [
  { "id": "warm", "name": "Warm and simple", "route": "/",
    "note": "Bigger type, more space.", "source": "hero-v2.fig" }
] }
```

`source` is a path **inside the project's design workspace** — relative, no
`..`, no absolute paths, no URLs. Anything else is dropped. Leave it out when the
option was written straight into code with no design file behind it; that is an
ordinary case and inventing a source is worse than omitting one.

Why it matters: the owner picks an option in one app and later opens the design
workspace. Without `source`, nothing connects the decision they just made to the
file it came from, and "why does the site look like this?" has three unrelated
answers.
