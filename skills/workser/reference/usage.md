---
topic: usage
title: Usage — what is being used, against the plan
summary: How much database, file storage, projects and apps are in use, and how close that is to what the plan allows.
commands: [usage]
---

# Usage — what is being used, against the plan

```
workser usage        # storage, projects, apps — and how close each is to the limit
```

Run it before you propose anything that adds to a count. "Create another
project" is a plan you can only sensibly make if you know the plan allows two
and two already exist.

## Two scopes in one answer, on purpose

* **Database and files are ORGANISATION-wide.** One pool across every project.
  There is no per-project storage limit, and reporting one would invent it.
* **Projects, and apps in this project, are counted where they apply.** These
  are the limits people actually hit.

## Two kinds of limit, which do not mean the same thing

* **Hard cap** — projects, apps. Going over is **refused**. `workser usage`
  exits non-zero when one is reached, so a step can gate on it.
* **Soft allowance** — database, files. Going over is **billed as extra**,
  never blocked. It does not fail the command, because a customer growing past
  their allowance should not have their automation start breaking that day.

## "not measured" is not zero

A figure that could not be read prints as `not measured`, with the reason, and
draws no bar. Do not report it as `0`, and do not tell the user they have room
based on it — nobody looked.

If a scan comes back with a figure missing, say which one and why. "Your
database is using 2.5 GB of 10; the file total could not be read" is a useful
sentence. "You are using 2.5 GB of 20" is not, and it is wrong.

## What to do with it

- Near a **soft** limit: tell the owner what the extra will cost them, and what
  is taking the space. Do not delete anything to make a number look better.
- At a **hard** cap: say which plan raises it. Do not attempt the create — it
  will be refused, and a failed attempt reads to the owner as a broken product.
