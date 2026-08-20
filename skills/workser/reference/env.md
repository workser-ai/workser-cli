---
topic: env
title: Settings — cloud, per environment, and on this computer
summary: Set and read an app's settings, hold a different value in production, and pull them onto this computer without clobbering local ones.
commands: [env]
---

# Settings — cloud, per environment, and on this computer

```
workser env set KEY=VALUE [K2=V2…] [--env production]
workser env list [--env production]      # keys, masked; marks where they differ
workser env get KEY [--env production]   # one value (sensitive)
workser env pull [--env production] [--overwrite]
```

## `--env` — say which environment you mean

`deploy`, `logs` and `versions` take `--env preview` or `--env production`.
`env set` takes those and `--env development` as well.

Without it: `deploy` builds a preview, `logs` and `versions` talk about
whichever deployment is newest, and `env set` writes to all three environments.
Those are the old defaults and they have not changed.

**There is no development deployment.** Nothing is ever built into it — it is
the environment the app uses when it runs on this computer — so `deploy --env
development` and `logs --env development` are refused rather than quietly shown
preview.

**A key can now hold a different value per environment.** `env set --env
production DATABASE_URL=…` writes an override; every other environment keeps
the shared value. `env list --env production` and `env get KEY --env production`
read it back.

Without `--env` you get the **shared** value — what the key is everywhere unless
overridden — and `env list` marks which keys differ:

```
API_KEY = sk-•••   (different in production)
```

That marker is the one to read before changing anything: editing the shared
value will not touch production if production has its own.

`env rm KEY --env production` removes just that override and the key keeps its
shared value. `env rm KEY` removes the key entirely.

## Local settings are this computer's, and are not overwritten

`env pull` writes into the app folder's own env file — `.env` for most runtimes,
`.env.local` for Next.js, because that is the file each one actually reads.

**It fills in what is missing and leaves what is already there alone.** A local
`DATABASE_URL` usually points at the developer's own database on purpose;
replacing it because somebody asked to pull one missing key destroys work
Workser cannot give back. Keys it left alone are **named** in the output.

```
workser env pull                    # fill the gaps, touch nothing else
workser env pull --env production   # fill them from production's values
workser env pull --overwrite        # replace local values too
```

Starting an app for the first time does the same thing automatically, with the
same rule.

## A key can hold a different value per environment

`workser env set --env production DATABASE_URL=…` writes an override; every
other environment keeps the shared value.

Without `--env` you get the **shared** value — what the key is everywhere unless
overridden — and `env list` marks which keys differ:

```
API_KEY = sk-•••   (different in production)
```

Read that marker before changing anything: editing the shared value will not
touch production if production has its own.

`env rm KEY --env production` removes just that override and the key keeps its
shared value. `env rm KEY` removes the key entirely.

## Local settings are this computer's, and are not overwritten

`env pull` writes into the app folder's own env file — `.env` for most runtimes,
`.env.local` for Next.js, because that is the file each one actually reads.

**It fills in what is missing and leaves what is already there alone.** A local
`DATABASE_URL` usually points at the developer's own database on purpose;
replacing it because somebody asked to pull one missing key destroys work
Workser cannot give back. Keys it left alone are **named** in the output.

```
workser env pull                    # fill the gaps, touch nothing else
workser env pull --env production   # fill them from production's values
workser env pull --overwrite        # replace local values too
```

Starting an app for the first time does the same thing automatically, with the
same rule.

## Notes that matter

- **`env set` writes a value you never see.** That's the point — when the user
  has a secret, have them run it (or set it in Orbit) rather than pasting it to
  you.
- **`env get` returns a secret.** Don't echo it into the conversation.
- **`env rm` is owner-only** (exit 6). Tell the user to do it in Orbit; don't
  look for a workaround.
- **Cloud and local are different environments.** `env set` configures the
  cloud; the files in the app folder configure this computer. Don't hand-edit
  one to change the other.
