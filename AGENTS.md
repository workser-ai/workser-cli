# Workser tools (for AI agents)

> This file is the portable instruction layer for agents **without** native Skills
> (Codex, Gemini CLI, Cursor, etc.). For Claude Code, the same content ships as a
> Skill at `skills/workser/SKILL.md`. Workser Orbit drops the right one per agent.

You have the `workser` CLI installed. Use it to **run** software on the user's
behalf — provision infrastructure, deploy, and manage live apps on Workser. The
agent thinks on the user's tokens; `workser` is how you act (DevOps + platform).

## Use it for the "last mile"
Writing code → your normal tools. Putting it online, databases, env vars, domains,
deploy status, logs → `workser`.

## Rules
- **Always add `--json`.** Output is `{"ok":true,"data":...}` or `{"ok":false,"error":{...}}`.
- Run `workser status --json` first to orient.
- `workser project use <id>` (or `project create <name>`) links a project to the
  current directory; later commands target it. Override with `--project <id>`.
- Provisioning commands are idempotent (`"created": false` if it already exists).
- If you get `error.code = "awaiting_approval"` (exit 5), the user must approve in
  Workser Orbit. Ask them to approve, then retry. Never attempt to bypass approvals.
- You never handle credentials — Orbit owns auth.

## Commands
```
workser status | whoami
workser project create <name> | list | use <id>
workser db create | url
workser auth enable
workser storage create [name]
workser env set KEY=VALUE… | list | get KEY | rm KEY
workser deploy [--prod] [--watch] | deploy status [id]
workser logs [-n N] [-f]
workser domain set <domain> | list
workser open
```

## Example
```bash
workser status --json
workser project create my-app --json
workser db create --json
workser deploy --prod --watch --json   # -> .data.url is the live URL
```
Report results to the user in plain language, not raw JSON.
