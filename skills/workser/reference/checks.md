---
topic: checks
title: Checks — is it safe, and is it still up
summary: Scan the code for leaked secrets, known-bad dependencies and over-broad permissions, and check that what you published is still answering.
commands: [scan, health]
---

# Checks — is it safe, and is it still up

Two questions nothing else in this CLI asks. `verify` tells you the code
compiles. These tell you it is not dangerous, and that it is still working an
hour after you shipped it.

Run both before you say a task is done.

```
workser scan                      # deps · secrets · permissions, over this folder
workser scan --check              # same, but exits non-zero on anything serious
workser scan --only secrets       # one check: deps, secrets, permissions
workser scan --staged             # look at staged changes only

workser health                    # is every published app still answering?
workser health --app <webAppId>   # just one
```

## scan

Three checks, all local — no login, no project, no network except for `deps`.

**secrets** looks at what your changes ADD (`git diff HEAD`), not at the whole
tree, so it fires on the key you just wrote rather than on every example file
forever. It knows the shapes that are actually credentials — AWS, GitHub,
Stripe, OpenAI, Anthropic, Google, Slack, private keys, database URLs with a
password in them, and `API_KEY = "…"` with something real on the right. It
ignores placeholders (`your-api-key`, `process.env.X`, `<REPLACE_ME>`) and
example, fixture and lockfile paths.

**deps** runs `npm audit` and reports high and critical only. Moderate and low
advisories on transitive dev dependencies are real and are not worth a report
nobody finishes reading.

**permissions** catches three specific mistakes: a `NEXT_PUBLIC_…SECRET`
compiled into the browser bundle, an API that accepts credentialed requests
from any website, and a real `.env` committed to the repository.

**A check that could not run says so.** Offline, `deps` reports "not checked"
with the reason — never "nothing found". If you are quoting a scan result, quote
what it checked as well as what it found.

If it finds a secret: move the value to `workser env set`, and treat the old one
as leaked. Rotating it is the owner's decision, not yours — say so and let them.

## health

Probes the stable preview and production addresses of every app in the project
and reports up or down, with the round trip. It exits non-zero if anything is
down, so a step can gate on it.

Two things worth knowing:

* It is the same check the desktop runs on a timer. Both fold into one streak,
  so a run of yours counts toward the same total.
* After three failed checks in a row on a **production** address that has
  worked before, an incident task is opened on the owner's board automatically.
  A preview address is checked and reported but never escalated — it is not
  customer-facing, and waking the owner for it teaches them to ignore the ones
  that are.

An app that has never been published has no address, so there is nothing to
check. That is reported as a note, not as a pass.
