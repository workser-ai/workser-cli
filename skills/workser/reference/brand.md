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
