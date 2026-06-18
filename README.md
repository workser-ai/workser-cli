# @workser/cli — `workser`

**The center of Workser Orbit.** `workser` is the command-line surface that lets a
local AI agent use Workser infrastructure natively — as the user's DevOps / platform
engineer. The agent runs `workser deploy`, `workser db create`, `workser status`,
etc. through its own shell, and real apps get provisioned, deployed, and managed on
Workser.

It's designed to be the **token-lean** primary integration (vs. injecting MCP tool
schemas into the agent's context on every turn): a shell call costs almost nothing,
and the agent is taught *when* to use it via a Skill (Claude) or `AGENTS.md`
(other agents). MCP stays available, but only inside a scoped subagent — see the
platform plans in `workser-agents-platform/`.

## How it connects

`workser` is a thin client of one endpoint contract, resolved in this order:

| Resolves | Precedence |
|---|---|
| **endpoint** | `--endpoint` → `$WORKSER_DAEMON_URL` → `~/.workser/session.json` → cloud default |
| **token** | `--token` → `$WORKSER_TOKEN` → session file |
| **project** | `--project` → `<cwd>/.workser/project.json` → session default |

- **Inside Workser Orbit (primary):** the app writes `~/.workser/session.json`
  pointing at its **local daemon** (`http://127.0.0.1:<port>`). Calls flow through
  the cockpit, which handles **auth (bridge JWT), approval gates, and live progress
  in the UI**. This is how the user *sees* what the agent does.
- **Standalone / CI:** `workser login --token <t>` saves a session against the
  **cloud API** (`https://api.workser.ai`). Same commands, no desktop app.

Both speak the same `/v1/...` contract (see `src/client.ts`).

## Install (dev)

```bash
npm install
npm run build
npm link          # makes `workser` available globally for local testing
workser --help
```

In production the binary is published as `@workser/cli` and also bundled inside the
Orbit desktop app, which installs it on PATH during onboarding.

## Command surface

```
workser status | whoami | login | logout
workser project create <name> | list | use <id>
workser db create | list | url
workser auth enable | status
workser storage create [name] | list
workser env set KEY=VALUE… | get KEY | list | rm KEY
workser deploy [--prod] [--watch] | deploy status [id]
workser logs [-n N] [-f]
workser domain set <domain> | list
workser open
```

Global flags: `--json`, `-q/--quiet`, `-p/--project <id>`, `-C/--cwd <dir>`,
`--endpoint <url>`, `--token <token>`.

## Design principles (the contract)

1. **Agent-first output.** Every command supports `--json`, returning a single
   stable line: `{"ok":true,"data":...}` or `{"ok":false,"error":{code,message,...}}`.
   Human text output is terse and colorized.
2. **Stable exit codes.** `0` ok · `1` generic · `3` unauthorized · `4` not connected
   · `5` awaiting approval.
3. **Idempotent provisioning.** `db/auth/storage create` return the existing resource
   (`created: false`) rather than failing.
4. **Approvals belong to the daemon.** Destructive/financial calls can return
   `awaiting_approval`; the user approves in Orbit. The CLI never bypasses gates.
5. **No credential handling.** Auth lives in Orbit / the session token; the agent
   never sees raw keys.

## Layout

```
src/
  index.ts          # program + global flags, registers commands
  run.ts            # action() wrapper: builds context, funnels errors
  context.ts        # resolve endpoint/token/project (daemon vs cloud)
  client.ts         # the single fetch() entrypoint + /v1 contract docs
  config.ts         # ~/.workser/session.json + <cwd>/.workser/project.json
  output.ts         # ok()/fail()/line() — text & --json rendering
  errors.ts         # WorkserError (code + status)
  commands/         # one file per command group
skills/workser/SKILL.md   # Claude Code Skill (progressive disclosure)
AGENTS.md                 # portable instructions for non-Skill agents
```

## Status

v0.1 scaffold. The `/v1/...` endpoints are the contract implemented by the Orbit
local daemon (and mirrored by cloud); commands are wired and the surface is stable.
Next: align endpoint shapes with `workser-core-api-service`'s `orbit` controller and
add integration tests against a daemon stub.
