# @workser/cli — `workser`

**The center of Workser Orbit.** `workser` is the command-line surface that lets a
local AI agent use Workser infrastructure natively — as the user's DevOps engineer.
The agent runs `workser deploy`, `workser env set`, `workser status`, etc. through
its own shell to ship and operate the app on Workser.

## Install

```bash
npm install -g @workser/cli
workser --version
```

Node 20+. If you use **Workser Desktop**, it installs and updates this for you —
you only need the manual install to use `workser` on its own, alongside Claude
Code, Codex, Cursor or any other agent.

### Using it standalone

Inside Workser Desktop the CLI talks to the local Orbit daemon, so every call
flows through the app's approval gates. On its own it talks to the Workser cloud
API instead:

```bash
workser login            # paste an API token, or pass --token
workser status           # confirm the connection and the linked project
workser doctor           # resolved endpoint, mode, token presence (masked)
```

Point your agent at it by telling it the command exists. For Claude Code, the
package ships a skill at `skills/workser/SKILL.md`; for Codex, Gemini, Kimi and
others, `AGENTS.md` covers the same ground. Copy whichever your agent reads:

```bash
# Claude Code (global)
mkdir -p ~/.claude/skills/workser
cp "$(npm root -g)/@workser/cli/skills/workser/SKILL.md" ~/.claude/skills/workser/

# Codex / Gemini / Kimi / opencode / Grok — merge into your project's AGENTS.md
cat "$(npm root -g)/@workser/cli/AGENTS.md" >> AGENTS.md
```

Agents should always pass `--json`.



### Scope: one project, operate within it

The CLI is the **agent-facing** surface, and it is deliberately small. It is bound
to the **single project** Orbit linked to the working directory. Within that project
the agent can **operate on the project's own infrastructure** — provision and use its
Neon Postgres database (create it, read its least-privilege connection string, browse
tables / schema / rows / run SQL), provision its bucket + auth, deploy, read/set env
vars, manage objects, read logs. The daemon **gates the sensitive actions** with an
approval prompt in the Orbit UI (`awaiting_approval`, exit 5), so the user stays in
the loop without the CLI having to refuse outright.

What stays **owner-only** (refuses with `error.code = "owner_only"`, exit 6, no
network call) is **administering the project set or destroying config**: creating or
switching which project is pinned, deleting env vars, and attaching custom domains.
This is the first of two gates — the daemon + core-api enforce the boundary
server-side too. See `src/capabilities.ts`.

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
| **cloud default** | `$WORKSER_API_URL` → `$WORKSER_ENV` → `prod` |
| **token** | `--token` → `$WORKSER_TOKEN` → session file |
| **project** | `--project` → `<cwd>/.workser/project.json` → session default |

`$WORKSER_ENV` names a backend rather than a URL:

| `WORKSER_ENV` | Base URL |
|---|---|
| unset / `prod` | `https://api.workser.ai` |
| `dev` | `https://dev-api.workser.ai` |
| `local` | `http://localhost:8000` (a core-api you run yourself) |

An unrecognised value is a hard error, not a silent fall-back to prod. Run
`workser doctor` to see the resolved env, endpoint, and which of the two it
came from.

- **Inside Workser Orbit (primary):** the app writes `~/.workser/session.json`
  pointing at its **local daemon** (`http://127.0.0.1:<port>`). Calls flow through
  the cockpit, which handles **auth (bridge JWT), approval gates, and live progress
  in the UI**. This is how the user *sees* what the agent does.
- **Standalone / CI:** `workser login --token <t>` saves a session against the
  **cloud API** for the current `$WORKSER_ENV`. Same commands, no desktop app.
  Note the session file records the endpoint it logged in against, so switching
  `$WORKSER_ENV` afterwards needs a fresh `workser login` (or `--endpoint`).

Both speak the same `/v1/...` contract (see `src/client.ts`).

## Install (dev)

```bash
npm install
npm run build
npm link          # makes `workser` available globally for local testing
workser --help
```

### Packaging (single self-contained file)

`npm run build` produces **one** self-contained executable: `dist/index.js`. tsup
bundles every runtime dependency (`commander`, `picocolors`) inline, keeps the
`#!/usr/bin/env node` shebang, and inlines the version — so the file runs under the
system `node` from any directory, with **no `node_modules`** alongside it.

The Orbit desktop connector relies on this: it copies exactly that one file to
`~/.workser/bin/workser` (and `chmod +x`) to install the CLI on the agent's PATH
during onboarding — no `npm install`, no dependency tree to ship. The binary is also
published as `@workser/cli`.

## Command surface

```
workser status | whoami | login | logout
workser project show | list                       # the pinned project + workspace (read)
workser db create                                 # provision Neon Postgres (idempotent)
workser db url | list                             # connection string + status
workser db tables | schema <t> | data <t> | query <sql>   # browse the Neon database
workser auth enable | status                      # provision + inspect auth
workser env set KEY=VALUE… | get KEY | list       # env vars
workser storage create [name] | list | ls [prefix]     # bucket + its objects
workser storage put <local> <key> | get <key> [dest]   # objects in the bucket
workser deploy [--prod] [--watch] | deploy status [id]
workser logs [-n N] [-f] | versions
workser domain list                               # custom domains (read)
workser open | verify | doctor
workser agent list | run <role> "<task>" | main

# owner-only — refuse with owner_only (exit 6), no network call:
workser project create · project use · env rm · domain set
```

Global flags: `--json`, `-q/--quiet`, `-p/--project <id>`, `-C/--cwd <dir>`,
`--endpoint <url>`, `--token <token>`.

## Design principles (the contract)

1. **Agent-first output.** Every command supports `--json`, returning a single
   stable line: `{"ok":true,"data":...}` or `{"ok":false,"error":{code,message,...}}`.
   Human text output is terse and colorized.
2. **Stable exit codes.** `0` ok · `1` generic · `3` unauthorized · `4` not connected
   · `5` awaiting approval · `6` owner-only.
3. **Least privilege by construction.** One project; the agent operates on *that*
   project's own infra (sensitive actions daemon-gated). Administering the project
   set or destroying config is owner-only (`owner_only`, exit 6); it refuses locally
   and is also unreachable with the agent's scoped key server-side.
4. **Approvals belong to the daemon.** Allowed-but-gated calls can return
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
  capabilities.ts   # the owner-only boundary (what the agent may NOT do)
  config.ts         # ~/.workser/session.json + <cwd>/.workser/project.json
  output.ts         # ok()/fail()/line() — text & --json rendering
  errors.ts         # WorkserError (code + status)
  commands/         # one file per command group
skills/workser/SKILL.md   # Claude Code Skill (progressive disclosure)
AGENTS.md                 # portable instructions for non-Skill agents
```

## Status

v0.1. The `/v1/...` endpoints are the contract implemented by the Orbit local daemon
(which proxies `workser-core-api-service`'s `orbit` controller and wraps replies in
`{ok,data}`); commands are aligned to that contract — including the Neon Postgres
browser (`db tables|schema|data|query`) — and verified live against the running
daemon. The suite (`npm test`) exercises every command against an in-process daemon
stub: request shapes, provisioning, the Neon browser, the storage object flow, exit
codes, nested-error normalization, and the owner-only boundary. Next: enforce the same
owner-only boundary server-side on the agent's project-scoped key (the second gate).
