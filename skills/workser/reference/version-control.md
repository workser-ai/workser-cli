---
topic: version-control
title: Saving, undoing & syncing your work
summary: Checkpoint before risky edits, restore when they go wrong, sync with Workser.
commands: [checkpoint, restore, sync]
---

# Saving, undoing & syncing your work

```
workser checkpoint ["what you're about to try"]  # save the folder as it stands now
workser restore                                  # go back to the newest checkpoint
workser restore --list                           # see the checkpoints you can go back to
workser restore <ref>                            # go back to a specific one
workser sync [--branch dev] [--app <id>]         # reconcile this folder with Workser
```

## Why these exist instead of git

This folder is a git repository, but **the history is Workser's**. There is no
remote: code moves to and from Workser over its API as git bundles, using the
same session everything else here uses. No credential is read, and the user's
own git keys and identity are never touched.

That is what makes any of this work on a computer with no access to the
Workser-managed repository — which is every computer. Nobody has repo access;
the API does.

So the ordinary git verbs are wrong here, and these three replace them:

| Instead of | Run |
|---|---|
| `git stash` | `workser checkpoint` |
| `git commit` | `workser checkpoint` |
| `git reset --hard` / `git checkout .` | `workser restore` |
| `git pull` / `git push` | `workser sync` |

Reading is always fine: `git log`, `git diff`, `git show`, `git status`.

## Notes that matter

- **Checkpoint before anything you might want to take back** — a refactor across
  many files, a dependency upgrade, deleting something large. It costs a second.
- **`git stash` is the one that actually loses work.** Workser publishes what is
  on disk, so a deploy while your changes are stashed ships the version *without
  them* — and if the run is stopped between `stash` and `stash pop`, the user
  opens their folder and their work is gone. `workser checkpoint` has neither
  failure mode.
- **Restoring never discards anything.** The current state is saved first, then
  the older state is restored on top. If you restore the wrong thing, restore
  again. Say this to the user — it is the reason they can afford to say yes.
- **These are the same checkpoints as the app's Undo button.** One history, not
  two: a checkpoint you take here appears in Workser, and vice versa.
- **`sync` pulls before it pushes.** If it reports `diverged`, both sides changed
  and it stops rather than picking a winner — tell the user to resolve it in
  Workser instead of forcing it.
- **These three need the Workser app running on this computer**, because they
  work with files. If you get `needs_local_app`, you are on a machine that only
  has the CLI and a token — say so rather than looking for a workaround. Every
  read-only command (`projects`, `env`, `db`, `logs`, `status`) still works.

## Shipping is separate

`workser sync` reconciles the folder. `workser deploy` puts it in front of
users. Syncing does not deploy, and deploying does not require you to sync
first — deploy publishes what is on disk. See `reference/deploy.md`.
