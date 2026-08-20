---
topic: neon
title: The project's own database
summary: Branches, databases, compute, plus Neon-branch object storage and functions. Dedicated tenancy only.
commands: [neon]
---

# The project's own database

The project's database, run the way an operator runs one: branches (copies of
the data), the databases on them, and the compute that serves them. Plus
S3-compatible object storage and Node.js HTTP functions on the same branch.

```
workser neon status                       # tenancy + toggles + region verdict

workser neon branch list                  # copies of the data; the live one is marked
workser neon branch create qa-run         # a copy to work on, made in a second
workser neon branch create qa --from <id> --no-compute
workser neon branch reset <branchId>      # throw its changes away (asks the owner)
workser neon branch rm <branchId>         # delete it and its data (asks the owner)

workser neon database list [--branch <id>]
workser neon database create <name> [--branch <id>] [--owner <role>]
workser neon database rm <name> [--branch <id>]   # asks the owner

workser neon endpoints                    # what compute is running, and idle

workser neon storage list | create <name> | rm <bucket>
workser neon storage ls <bucket> [prefix]
workser neon storage put <bucket> <local> [key]
workser neon storage get <bucket> <key> [dest]
workser neon storage url <bucket> <key>   # temporary download URL
workser neon functions list | deploy <slug> <zip> | rm <slug>
```

## Check `neon status` first — always

Three things must all be true: **dedicated tenancy**, the capability **switched on**,
and a **supported region**.

Region is fixed when the project is created. `regionSupportsNeonBackend: false` is
**final, not retryable** — no amount of waiting or retrying changes it. When you see
it, say so plainly and fall back to `workser storage` (the default bucket).

## Branches are the useful one

A branch is a **full copy of the data**, made in about a second, costing almost
nothing until something writes to it. That is what lets a check run against real
data without being able to damage it — give a QA step its own branch instead of
pointing it at the live database.

Two things cannot happen at all, whatever anyone approves: **the branch the app
runs on cannot be deleted or reset**, and neither can **the database it connects
to**. Those refusals come from the server, not from the approval prompt. If you
meant to reset a copy and got that message, you named the live one.

`reset` deletes nothing by name and destroys just as much: it replaces a
branch's contents with its source's. It asks the owner for exactly that reason.

`--no-compute` makes a branch with no compute. It is cheaper and **nothing can
connect to it** — useful as a snapshot, useless as somewhere to run tests.

## Notes that matter

- **`neon storage rm <bucket>` deletes the bucket and everything in it.** Not
  reversible. Confirm with the user first.
- **`neon storage url`** issues a short-lived URL — prefer it to moving large files
  through Workser.
- **Functions deploy from a zip.** Build the bundle first, then
  `workser neon functions deploy <slug> <zip>`.
- **`neon endpoints` is the cost question.** `active` means it is billing;
  `idle` means it is not. It is the only place in the product that answers "what
  is this database costing me while nothing is happening".
- **Most apps never need the storage or functions half.** If the user just wants
  to store uploads, the default bucket in `reference/storage.md` is the answer.
