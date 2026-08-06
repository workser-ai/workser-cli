---
topic: database
title: Database & end users
summary: Provision Postgres, browse tables, run SQL, provision auth.
commands: [db, auth]
---

# Database & end users

The project's Postgres (Neon behind Workser) and its end-user auth. Provisioning is
idempotent — running `create` twice is safe.

```
workser db create                   # provision the Neon Postgres database (idempotent)
workser db url                      # connection string (sensitive; least-privilege role)
workser db list                     # database status
workser db tables                   # list tables in the database
workser db schema <table>           # a table's columns
workser db data <table> [-n N] [--offset N]   # read rows
workser db query "<sql>"            # run SQL (writes are approval-gated)

workser auth enable                 # provision auth for the project (idempotent)
workser auth status                 # is auth enabled? + Neon auth mode
```

## Notes that matter

- **`db url` is a credential.** Don't print it into the conversation, don't paste it
  into a file the user will commit. The app gets it from its environment already.
- **Writes are approval-gated.** A `db query` that mutates may return
  `awaiting_approval` (exit 5). Ask the user to approve in Orbit, then retry.
- **`DROP` / `TRUNCATE` are refused** by the safety policy. Change schema with a
  migration in the app's own migration folder, not with a destructive one-off.
- **The database is the project's, not the app's.** Sibling apps in the same project
  share it. Don't assume a table is yours because you created it.

## Reading rows vs. reading data at runtime

`db data` / `db query` are for **you**, inspecting while you build. The app itself
should read through `@workser/app` (`workser.db`, `workser.business`) — see the
`workser-sdk` skill. An app that shells out to the CLI at request time is wrong.
