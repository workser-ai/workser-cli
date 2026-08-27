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

## What you can and can't do
You are scoped to **one project** — the one Orbit linked to this directory. Within it
you operate on the project's **own infrastructure**: provision and use its Neon
Postgres database (`db create`, read its connection string, browse tables / schema /
rows, run SQL), provision its bucket + auth, deploy, read/set env vars, manage files,
read logs. Sensitive actions are **gated**: the daemon may return
`error.code = "awaiting_approval"` (exit 5) and wait for the user to approve in Orbit
— ask them to approve, then retry.

What you **cannot** do is administer the project set or destroy config: creating or
switching which project is pinned, deleting env vars, or attaching a custom domain.
Those are **owner actions** — you get `error.code = "owner_only"` (exit 6). Don't
retry or look for a workaround; tell the user it's an owner action and continue with
what you *can* do.

## Rules
- **Always add `--json`.** Output is `{"ok":true,"data":...}` or `{"ok":false,"error":{...}}`.
- Run `workser status --json` first to orient. The project is already selected for
  you (Orbit pinned it); you don't pick or switch projects.
- `error.code = "owner_only"` (exit 6) → an owner-only action. Tell the user to do
  it in Orbit; never try to bypass it.
- `error.code = "awaiting_approval"` (exit 5) → the user must approve in Orbit. Ask
  them to approve, then retry. Never attempt to bypass approvals.
- You never handle credentials — Orbit owns auth.

## Commands
```
workser status | whoami                       # orient (read)
workser project show | list                   # your pinned project + the workspace
workser env set KEY=VALUE… | list | get KEY   # env vars
workser env pull [--out .env.local]           # write cloud env vars into a local file
workser db create                             # provision the Neon Postgres database
workser db url | list                         # DB connection string + status
workser db tables                             # list tables in the database
workser db schema <table>                     # a table's columns
workser db data <table> [-n N] [--offset N]   # read rows
workser db query "<sql>"                      # run SQL (writes are approval-gated)
workser auth enable | status                  # provision + inspect auth
workser storage create [name] | list          # provision + show the bucket
workser storage ls [prefix]                   # list objects in the bucket
workser storage put <local> <key>             # upload a file into the bucket
workser storage get <key> [dest]              # download (or print the object URL)

workser neon status                           # can this project use Neon storage/functions?
workser neon storage list | create <name> | rm <bucket>
workser neon storage ls <bucket> [prefix]     # list objects
workser neon storage put <bucket> <local> [key] | get <bucket> <key> [dest]
workser neon storage url <bucket> <key>       # temporary download URL
workser neon functions list | deploy <slug> <zip> | rm <slug>

workser deploy [--prod] [--watch] | deploy status [id]
workser logs [-n N] [-f] | versions
workser domain list                           # custom domains (read)
workser open
workser agent list | run <role> "<task>" | main
workser workflow list | create <name> [--body <json>] | get <id>
workser workflow activate <id> | deactivate <id> | run <id> [--wait] [--body <json>]
workser workflow runs <id>                    # past executions of a workflow
workser workflow nodes [query]                # search the node-type catalog
workser connection list [--toolkit <slug>]           # connectable + connected third-party apps
workser connection search "<query>" [--toolkit <slug>] [--limit N]  # full-text search across every toolkit's actions
workser connection connect <toolkit> | disconnect <connectionId>
workser connection tools <toolkit>                   # browse one connected toolkit's callable actions
workser connection run <toolSlug> [--body <json>]    # execute one action (e.g. GOOGLESHEETS_APPEND_ROW)

workser tool list                             # computer-use tools available to you now
workser tool run <name> [--body <json>]       # filesystem/shell/screenshot/input/clipboard/browser

workser memory add "<content>" [--metadata <json>]  # remember something across future conversations
workser memory search "<query>" [--limit N]         # recall what you (or a cloud agent) learned before
workser memory forget <memoryId>                    # soft-delete an outdated/incorrect memory

workser artifact add <path> [--kind <k>] [-d <text>]  # record a finished deliverable
workser artifact add --url <url> --kind app          # record a deployed app
workser artifact run                                 # which task you're attached to

workser search "<query>" [-n <maxResults>]           # Google-grounded web search

workser image generate "<prompt>" [-r <url>...] [-o <path>]  # generate an image, get a public URL
workser image understand "<query>" [--url <u>|--file <p>] [-t <task>]  # describe/caption/answer questions about an image
workser video understand "<query>" [--url <u>|--file <p>] [-t <task>]  # summarize/describe a video (URL also accepts YouTube)
workser audio understand "<query>" [--url <u>|--file <p>] [-t <task>]  # transcribe/describe audio (URL also accepts YouTube)
# image/video/audio understand: the fallback for a text-only model, or media you have no other
# way to see/hear. --url is fetched server-side (no size ceiling); --file reads a small local
# file and sends it inline — for anything bigger, `workser storage upload` it and pass --url.

workser ask "<question>" [--type <t>] [--option <o>] # ask the user, WAIT for the answer

# owner-only (will return owner_only / exit 6 — ask the user to do these in Orbit):
#   project create, project use, env rm, domain set
```

## Project tracking (the Board, Docs and Memory the user sees in Orbit)
```
workser board list | show <id>                       # what's already tracked
workser board create "<title>" [--description <t>] [--status <s>] [--priority <p>]
workser board move <id> <backlog|in-progress|in-review|done> | close <id>
workser decision list | show <id>                    # what was already decided
workser decision create "<title>" --context <t> --decision <t> [--consequences <t>]
workser requirement list | show <id> | create "<title>" --body <t> | update <id> --status <s>
workser doc list | show <id> [--markdown]
workser doc create "<title>" --markdown <text> | doc update <id> --markdown <text>
```
**Read before you plan** — `board list` and `decision list` tell you what someone is
already doing and what this project chose on purpose, so you don't re-file work or
quietly reverse a decision.

**A plan with phases goes on the Board before you build it.** The moment you split a
task into more than one phase: one `board create` card per phase (only the one you're
doing goes to `in-progress`), the plan itself as one `doc create --markdown` — with
**no `--work-item`**, because a linked doc is shown on its card and hidden from the
Docs panel — and a `decision create` if the plan settled a real tradeoff. A plan that
lives only in your reply is gone as soon as the conversation scrolls.

**Keep it true as you work.** `board move <id> in-progress` when you pick it up,
`in-review` when it's ready to look at, `board close <id>` when it's done and
verified. A Board still reading `backlog` after you shipped is worse than no Board.
Decisions are append-only: supersede an old one with a new record, never edit it.

## Memory (remember across conversations, not just this one)
Every conversation you run is otherwise a fresh start — no memory of what you or the
user decided last time. `workser memory add "<content>"` fixes that: it stores durable,
searchable memory for the CURRENT PROJECT, and it's the SAME memory space Workser's own
cloud agents write to for this project — add something here and a cloud agent (or your
own next conversation) can `workser memory search` and find it. Use it for things worth
remembering past this one conversation: user preferences, decisions made, important
context, requirements — not routine chatter. Before assuming you don't know something
about this project, `workser memory search "<topic>"` first; it may already be recorded.
`forget` soft-deletes a specific memory if it's wrong or outdated.

## Record what you produced (deliverables)
Workser shows the user a **Deliverables** list on the task. If you don't say what you
made, it has to guess — it watches your file edits and treats any path it sees as a
deliverable, so scratch files and half-finished drafts show up next to the real output,
and things that aren't files at all (a folder of results, an app you deployed) can't
show up correctly. Fix that by declaring finished output:
```
workser artifact add ./report.pdf -d "Q3 sales summary"
workser artifact add ./exports --kind folder -d "generated CSVs"
workser artifact add --url https://acme.workser.app --kind app -t "Storefront"
```
Only register FINISHED output the user should get — not temp files, not intermediate
steps. `--kind` is inferred from the path when you omit it (directories are detected
automatically); pass it explicitly for `app` / `url`. `workser artifact run` shows which
task you're currently attached to.

To publish an app: `workser deploy` (preview) or `workser deploy --prod` (live), then
register the URL it returns as an `app` artifact so the user can open it from the task.

## Ask the user something (and get an answer back)
When you're blocked — a missing value, an ambiguous requirement, permission for
something consequential — don't guess and don't just write the question into your
final message. Run:
```
workser ask "Which email should order confirmations come from?"
workser ask "Which plan should I wire up?" --option Free --option Pro --option Team
workser ask "Delete the 1,240 archived rows?" --type approval
```
This shows the user a real card in the conversation and **blocks until they answer**,
then prints their answer — so you ask, read the reply, and keep working in the same
turn. Types: `input` (default, free text), `choice` (with `--option`), `approval`
(permission), `confirmation` (check an assumption), `information` (FYI, no answer
needed). It times out (default 10 min) rather than hanging forever; if it does, carry
on and state clearly what you assumed.

**Never ask for a secret value this way** — the answer is stored and displayed. Ask
where a key should go, then have the user set it (`workser env set` writes it without
you ever seeing it).

## Neon backend (the project's own storage + functions)
Beyond the default bucket (`workser storage`, shared Cloudflare R2), a project can
have its OWN infrastructure on its Neon branch: S3-compatible buckets and Node.js
HTTP functions, both branching with the database.

**Run `workser neon status --json` before using either.** It tells you three things,
and all three must be true: the project is on dedicated infrastructure, the capability
is switched on, and the project's REGION supports it. Region matters most — Neon's
storage/functions run only in certain regions, and a project's region is fixed when
it was created. `regionSupportsNeonBackend: false` is final: don't retry, don't look
for a workaround, tell the user the project's region can't host it and use
`workser storage` (the default bucket) instead.

```
workser neon storage create assets            # make a bucket
workser neon storage put assets ./logo.png    # upload (bytes go straight to Neon)
workser neon storage url assets logo.png      # temporary link to share
workser neon functions deploy api ./api.zip   # deploy a Node.js HTTP handler
```
Deleting a bucket, an object, or a function is approval-gated — expect exit 5 /
`awaiting_approval`, ask the user to approve, then retry.

Prefer `workser storage` for ordinary file storage. Reach for `workser neon storage`
when the files should live on the project's own infrastructure (isolated per project,
branching with the database), and `workser neon functions` when the app needs
server-side endpoints next to its data.

## Computer-use tools (your hands on this machine)
`workser tool list` shows what's available — filesystem (read/write/list/delete/move),
shell (run a command/Python/Node), screenshots and screen info, mouse/keyboard input,
clipboard, notifications, and basic browser control (open a URL, read the page, click/
fill/type, screenshot). This is the SAME engine Workser's cloud Computer Use agent uses
when it controls a user's machine remotely — you get it locally, gated by the same
safety policy (blocked paths like `~/.ssh`, blocked destructive commands, rate limits).
Sensitive actions (writing/deleting files, running a shell command, clicking/typing) may
return `awaiting_approval` (exit 5) — handle it the same as any other gated action: tell
the user to approve in Orbit, then retry. This is a curated subset, not full desktop
automation — check `workser tool list` rather than assuming a capability exists.

## Workflow automation & app integrations
Beyond one-shot code, you can wire up **automations** that keep running after you're
done: `workser workflow create` builds an event-driven, multi-step automation (the
same engine Workser's own web Workflow tab uses) — nodes, connections, and triggers go
in `--body` as JSON; browse `workser workflow nodes` first to see what's available.
Before an automation can use a third-party app (Gmail, Slack, Stripe, Google Sheets,
...), the user connects it once via `workser connection connect <toolkit>` (this opens
an OAuth link — ask the user to complete it, then continue); after that, `workser
connection run <toolSlug> --body '{"...":...}'` calls any of its actions directly, and
a workflow node can call the same toolkit. Use `workser connection list` to see what's
already connected before assuming you need to ask the user to connect something new.
Don't know the exact action slug? `workser connection search "<what you want to do>"`
searches across every toolkit's actions at once — cheaper than browsing toolkit by
toolkit with `workser connection tools <toolkit>`.

## Delegate to roles
The user can configure **roles** — named specialists each backed by a local CLI agent
(e.g. `qa` → codex, `designer` → claude_code). Delegate a focused subtask with
`workser agent run <role> "<task>" --json`; the role runs as an **isolated local
subagent** (own context) and returns `{role, agent, output, exitCode}`. Run
`workser agent list --json` first to see the configured, runnable roles. Use this to
keep your own context lean and get a specialized second perspective; a non-zero
`exitCode` means the role's run failed — surface it.

## Example
```bash
workser status --json                  # orient: which project, last deploy
workser board list --json              # what's tracked; decision list for what's decided
workser board create "Phase 1 — …" --status in-progress --json   # phased plan -> cards
workser doc create "Plan" --markdown "…" --json                  # …plus the plan doc
workser env set STRIPE_KEY=sk_live_… --json
# … you write the app code with your normal tools …
workser deploy --prod --watch --json   # -> .data.url is the live URL
workser board close <id> --json        # the Board now matches reality
```
Report results to the user in plain language, not raw JSON.
