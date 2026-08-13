/**
 * GENERATED — do not edit.
 *
 * Run `npm run build:help` after changing a file in `skills/workser/reference/`.
 * `test/help.test.ts` fails when this file has drifted from them, or when a
 * registered command is covered by no topic at all.
 */

export interface HelpTopic {
  topic: string;
  title: string;
  summary: string;
  /** Top-level commands this topic documents. Checked against the real ones. */
  commands: readonly string[];
  /** Canonical markdown this was generated from. */
  source: string;
  body: string;
}

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    topic: "automation",
    title: "Workflows & connected apps",
    summary: "Build automations that outlive the run; use Gmail, Slack, Stripe, Sheets.",
    commands: ["workflow","app"],
    source: "skills/workser/reference/automation.md",
    body: `# Workflows & connected apps

Wire up **automations** that keep running after you're done, and use third-party
accounts (Gmail, Slack, Stripe, Google Sheets) the project has connected.

\`\`\`
workser workflow list | create <name> [--body <json>] | get <id>
workser workflow activate <id> | deactivate <id> | run <id> [--wait] [--body <json>]
workser workflow runs <id>          # past executions of a workflow
workser workflow nodes [query]      # search the node-type catalog

workser app list [--toolkit <slug>] # connectable + connected third-party apps
workser app connect <toolkit> | disconnect <connectionId>
workser app tools <toolkit>         # a connected app's callable actions
workser app run <toolSlug> [--body <json>]  # execute one action
\`\`\`

## Building a workflow

\`workser workflow create\` builds an event-driven, multi-step automation — the same
engine Workser's own web Workflow tab uses. Nodes, connections and triggers go in
\`--body\` as JSON.

**Browse \`workser workflow nodes\` first.** Inventing a node type that doesn't exist
produces a workflow that saves and then never runs.

Created workflows start inactive: \`workser workflow activate <id>\` when it's ready.

## Using a connected app

1. \`workser app list\` — check what's already connected before asking for anything.
2. If it isn't: \`workser app connect <toolkit>\` returns an OAuth link. The **user**
   must open it; you cannot complete OAuth on their behalf. Wait, then continue.
3. \`workser app tools <toolkit>\` — read the argument schema rather than guessing
   field names.
4. \`workser app run <toolSlug> --body '{"…":…}'\` — e.g. \`GOOGLESHEETS_APPEND_ROW\`,
   \`GMAIL_SEND_EMAIL\`.

**A \`run\` is a real side effect in someone's real account.** Sending an email or
charging a card is not a dry run — say what you're about to do before you do it.

## The half people forget

A workflow-backed feature is two-way. Triggering it is the outbound half; when the
workflow produces a result the app needs, its final node has to POST back to a
webhook route in the app. Build only the trigger and the workflow runs perfectly
while nothing ever appears in the product. The app-side receiver is covered in the
\`workser-sdk\` skill under workflows.
`,
  },
  {
    topic: "brand",
    title: "The project's brand",
    summary: "Read the owner's colours, fonts and logo before writing UI, and wire the generated design tokens into the app's theme.",
    commands: ["design"],
    source: "skills/workser/reference/brand.md",
    body: `# The project's brand

\`\`\`
workser design show [--raw]
\`\`\`

The owner sets their brand once in Workser (logo, colours, fonts). Everything
you build should follow it. Read it **before writing any UI**:

\`\`\`bash
workser design show --json
\`\`\`

\`\`\`json
{"ok":true,"data":{"hasBrand":true,
  "colors":{"primary":"#1f7a4d","accent":"#f5a623"},
  "fonts":{"heading":"Inter","body":"Inter"},
  "brand":{"name":"Green Grocer"},
  "files":["design/tokens.json","design/tokens.css"]}}
\`\`\`

This asks the server, which derives the answer from the brand record itself — so
it is correct even if nothing has been written into the working tree yet. That's
the reason to use it instead of looking for a file and guessing when it's absent.

\`"hasBrand": false\` is an ordinary state — most projects have no brand set.
Choose sensible styling yourself; **don't** stop and ask the user to define a
brand first.

## Using it in the code

The same values are generated into the working tree as two files:

- \`design/tokens.json\` — the tokens in DTCG form
- \`design/tokens.css\` — plain CSS custom properties (\`--ws-color-*\`, \`--ws-font-*\`)

Wire \`design/tokens.css\` into the app's theme the way this app's setup expects —
it assumes no particular Tailwind version, so map it rather than pasting it.

**Both files are generated and overwritten wholesale.** Never hand-edit them;
your edit disappears on the next sync. \`workser design show --raw\` prints them
verbatim if you need to see exactly what's in them.

## Changing the brand is the owner's job

There is no \`workser design set\` — the brand is one record the owner controls in
the Workser app, and it drives everything generated from it. If the user asks you
to change their brand colour, tell them where it lives (Design → Brand in Orbit)
rather than writing the colour into the app by hand, which would drift from every
other surface the brand feeds.

For generating artwork *in* the brand's palette, see \`workser help images\` —
put the colours from \`design show\` into the prompt.
`,
  },
  {
    topic: "business",
    title: "Business hub data",
    summary: "Products, orders, customers, sales, content, marketing, support, analytics.",
    commands: ["business"],
    source: "skills/workser/reference/business-data.md",
    body: `# Business hub data

The project's own commerce and CRM records — the **same rows** the Orbit desktop
Business tab and workser-web's Business hub show. One generic CRUD surface across
every resource rather than a command per domain.

\`\`\`
workser business resources                        # the known resource names
workser business list <resource> [subpath]        # list/read  (--query '<json>')
workser business get <resource> <id>
workser business create <resource> --body '<json>'
workser business update <resource> <id> --body '<json>'
workser business delete <resource> <id>
workser business action <resource> <id> <verb>    # POST .../<id>/<verb>
\`\`\`

## Resources

\`business-config\`, \`business-settings\`, \`products\`, \`collections\`, \`navigations\`,
\`orders\`, \`customers\`, \`sales-pipelines\`, \`sales-deals\`, \`pages\`, \`blog-posts\`,
\`media\`, \`campaigns\`, \`email-templates\`, \`discounts\`, \`seo-configs\`,
\`social-accounts\`, \`support-conversations\`, \`automation-rules\`, \`analytics\`.

Run \`workser business resources --json\` rather than trusting this list — the CLI's
copy is the current one.

## Notes that matter

- **Sales and Support nest.** \`sales-deals\` maps to \`/sales/deals\`,
  \`support-conversations\` to \`/support/conversations\`. Use the dashed names above;
  the flat \`resource/id\` shape then works for \`get\`/\`update\`/\`delete\`/\`action\`.
- **\`list\` takes a raw subpath** for anything the map doesn't cover:
  \`workser business list sales-pipelines <id>/stages\`.
- **\`action\` is for named verbs** — \`workser business action orders <id> cancel\`,
  \`workser business action sales-deals <dealId> win\`. Check the resource's routes
  before inventing a verb.
- **These are real business records.** Cancelling an order or deleting a customer is
  not a dry run. Say what you're about to do first.

## This is for you, not for the app

\`workser business\` is how **you** inspect and fix data while building. The app reads
the same records at runtime through \`workser.business\` in \`@workser/app\` — see the
\`workser-sdk\` skill. An app shelling out to this CLI per request is wrong.
`,
  },
  {
    topic: "computer-use",
    title: "Computer-use tools",
    summary: "Files, shell, screen, input, clipboard and browser on this machine.",
    commands: ["tool"],
    source: "skills/workser/reference/computer-use.md",
    body: `# Computer-use tools — your hands on this machine

\`\`\`
workser tool list                        # what's available to you right now
workser tool run <name> [--body <json>]  # run one
\`\`\`

\`workser tool list\` shows what's available — filesystem (read/write/list/delete/move),
shell (run a command / Python / Node), screenshots and screen info, mouse and keyboard
input, clipboard, notifications, and basic browser control (open a URL, read the page,
click, fill, type, screenshot).

This is the **same engine** Workser's cloud Computer Use agent uses when it controls a
user's machine remotely — you're getting it locally, gated by the same safety policy.

## Notes that matter

- **Check \`tool list\` rather than assuming a capability exists.** This is a curated
  subset, not full desktop automation.
- **The safety policy applies.** Blocked paths (\`~/.ssh\` and friends), blocked
  destructive commands, rate limits. Refusals are the policy working, not a bug to
  route around.
- **Sensitive actions are approval-gated.** Writing or deleting files, running a shell
  command, clicking or typing may return \`awaiting_approval\` (exit 5) — tell the user
  to approve in Orbit, then retry.
- **You already have your own tools.** For editing files in this repo, use them. Reach
  for \`workser tool\` when you need something *outside* the project — the screen, the
  clipboard, a browser, another app on the machine.
`,
  },
  {
    topic: "database",
    title: "Database & end users",
    summary: "Provision Postgres, browse tables, run SQL, provision auth.",
    commands: ["db","auth"],
    source: "skills/workser/reference/database.md",
    body: `# Database & end users

The project's Postgres (Neon behind Workser) and its end-user auth. Provisioning is
idempotent — running \`create\` twice is safe.

\`\`\`
workser db create                   # provision the Neon Postgres database (idempotent)
workser db url                      # connection string (sensitive; least-privilege role)
workser db list                     # database status
workser db tables                   # list tables in the database
workser db schema <table>           # a table's columns
workser db data <table> [-n N] [--offset N]   # read rows
workser db query "<sql>"            # run SQL (writes are approval-gated)

workser auth enable                 # provision auth for the project (idempotent)
workser auth status                 # is auth enabled? + Neon auth mode
\`\`\`

## Notes that matter

- **\`db url\` is a credential.** Don't print it into the conversation, don't paste it
  into a file the user will commit. The app gets it from its environment already.
- **Writes are approval-gated.** A \`db query\` that mutates may return
  \`awaiting_approval\` (exit 5). Ask the user to approve in Orbit, then retry.
- **\`DROP\` / \`TRUNCATE\` are refused** by the safety policy. Change schema with a
  migration in the app's own migration folder, not with a destructive one-off.
- **The database is the project's, not the app's.** Sibling apps in the same project
  share it. Don't assume a table is yours because you created it.

## Reading rows vs. reading data at runtime

\`db data\` / \`db query\` are for **you**, inspecting while you build. The app itself
should read through \`@workser/app\` (\`workser.db\`, \`workser.business\`) — see the
\`workser-sdk\` skill. An app that shells out to the CLI at request time is wrong.
`,
  },
  {
    topic: "deliverables",
    title: "Deliverables & asking the user",
    summary: "Record finished output on the task, and ask a blocking question.",
    commands: ["artifact","ask"],
    source: "skills/workser/reference/deliverables.md",
    body: `# Deliverables & asking the user

Two things that reach the user directly: what you produced, and what you need from
them.

\`\`\`
workser artifact add <path> [--kind <k>] [-d <text>]  # record a finished deliverable
workser artifact add --url <url> --kind app           # record a deployed app
workser artifact run                                  # which task you're attached to

workser ask "<question>" [--type <t>] [--option <o>]  # ask the user, WAIT for the answer
\`\`\`

## Record what you produced

Workser shows the user a **Deliverables** list on the task. If you don't say what you
made, it has to guess — it watches your file edits and treats any path it sees as a
deliverable, so scratch files and half-finished drafts show up next to the real
output, and things that aren't files at all (a folder of results, a deployed app)
can't show up correctly.

\`\`\`
workser artifact add ./report.pdf -d "Q3 sales summary"
workser artifact add ./exports --kind folder -d "generated CSVs"
workser artifact add --url https://acme.workser.app --kind app -t "Storefront"
\`\`\`

Only register **finished** output the user should get — not temp files, not
intermediate steps. \`--kind\` is inferred from the path when you omit it (directories
are detected automatically); pass it explicitly for \`app\` / \`url\`.

To publish an app: \`workser deploy\` (preview) or \`workser deploy --prod\` (live), then
register the URL it returns as an \`app\` artifact so the user can open it from the task.

## Ask the user something (and get an answer back)

When you're blocked — a missing value, an ambiguous requirement, permission for
something consequential — don't guess, and don't just write the question into your
final message where nobody will answer it.

\`\`\`
workser ask "Which email should order confirmations come from?"
workser ask "Which plan should I wire up?" --option Free --option Pro --option Team
workser ask "Delete the 1,240 archived rows?" --type approval
\`\`\`

This shows the user a real card in the conversation and **blocks until they answer**,
then prints their answer — so you ask, read the reply, and keep working in the same
turn.

Types: \`input\` (default, free text), \`choice\` (with \`--option\`), \`approval\`
(permission), \`confirmation\` (check an assumption), \`information\` (FYI, no answer
needed). It times out (default 10 min) rather than hanging forever; if it does, carry
on and state clearly what you assumed.

**Never ask for a secret value this way** — the answer is stored and displayed. Ask
*where* a key should go, then have the user set it (\`workser env set\` writes it
without you ever seeing it).
`,
  },
  {
    topic: "deploy",
    title: "Deploy, environment variables & logs",
    summary: "Ship the app, configure it, and find out why it is down.",
    commands: ["deploy","env","logs","versions","domain","open","verify"],
    source: "skills/workser/reference/deploy.md",
    body: `# Deploy, environment variables & logs

Getting the app online and configured, and finding out why it isn't.

\`\`\`
workser deploy [--prod] [--watch]   # deploy (git → Vercel); --watch waits for live URL
workser deploy status [id]          # status of a deploy (default: latest)
workser logs [-n 100] [-f]          # recent logs
workser versions                    # deploy history
workser domain list                 # custom domains (read)
workser open                        # open the live app
workser verify                      # run typecheck/lint/build

workser env set KEY=VALUE [K2=V2…]  # set env vars
workser env list                    # list keys (values masked)
workser env get KEY                 # one value (sensitive)
\`\`\`

## Notes that matter

- **\`verify\` gates "done".** Run \`workser verify --json\` before you say a task is
  finished. \`"ok": false\` means fix the listed errors and re-run — a green build is
  the bar, not your reading of the diff.
- **\`deploy\` without \`--prod\` is a preview.** Preview first when the change is
  risky; \`--prod\` puts it in front of real users.
- **\`--watch\` blocks until there's a live URL.** Without it you get a deploy id and
  have to poll \`deploy status\`.
- **\`env set\` writes a value you never see.** That's the point — when the user has
  a secret, have them run it (or set it in Orbit) rather than pasting it to you.
- **\`env get\` returns a secret.** Don't echo it into the conversation.
- **\`env rm\` and \`domain set\` are owner-only** (exit 6). Tell the user to do it in
  Orbit; don't look for a workaround.

## After a successful deploy

Register the URL so it shows up on the user's task:

\`\`\`
workser artifact add --url https://acme.workser.app --kind app -t "Storefront"
\`\`\`

See \`reference/deliverables.md\`.

## Local vs cloud environment

\`env set\` configures the **cloud** environment (production and preview). The \`.env\`
files in the app folder configure **this computer** — the user edits those in Orbit
under Settings → "On this computer", and saving there restarts the dev server. Don't
hand-edit \`.env.local\` to change cloud behaviour; they are different environments.
`,
  },
  {
    topic: "images",
    title: "Image generation",
    summary: "Generate images from a prompt, optionally conditioned on existing images.",
    commands: ["image"],
    source: "skills/workser/reference/images.md",
    body: `# Image generation

\`\`\`
workser image generate "<prompt>"            # alias: workser image gen
  -r, --reference <url...>                   # condition on existing images (up to 4)
  -o, --output <path>                        # also download the first image locally
\`\`\`

Returns the generated image's public URL, so the usual move is to generate, then use
that URL directly in the app.

\`\`\`bash
workser image generate "flat illustration of a farm delivery van, brand colors" --json
workser image gen "same van, from the side" -r https://… -o ./public/van.png --json
\`\`\`

## Notes that matter

- **Reference images are image-to-image conditioning**, not attachments. Up to 4;
  anything beyond that is dropped.
- **The model sometimes narrates instead of drawing** — a refusal or a clarifying
  question comes back as text rather than an image. Check that you actually got an
  image before wiring the URL into a page; an empty result is not a transport error
  to retry.
- **\`--output\` writes only the first image.** If you asked for several, the rest
  exist only as URLs.
- **Placeholder art is not a deliverable.** Generating a hero image to unblock a
  layout is fine; shipping it as the user's brand asset without asking is not.
`,
  },
  {
    topic: "memory",
    title: "Memory across conversations",
    summary: "Store and recall durable project knowledge shared with cloud agents.",
    commands: ["memory"],
    source: "skills/workser/reference/memory.md",
    body: `# Memory — remember across conversations, not just this one

\`\`\`
workser memory add "<content>" [--metadata <json>]  # remember for future conversations
workser memory search "<query>" [--limit N]         # recall what was learned before
workser memory forget <memoryId>                    # soft-delete an outdated memory
\`\`\`

## Why this exists

Every conversation you run is otherwise a fresh start — no memory of what you or the
user decided last time. This stores durable, searchable memory for the **current
project**, and it is the **same memory space** Workser's cloud agents write to for
this project. Add something here and a cloud agent — or your own next conversation —
can \`memory search\` and find it.

## Using it well

- **Search before assuming you don't know.** Before concluding something about this
  project is undocumented, run \`workser memory search "<topic>"\`. It may already be
  recorded.
- **Store decisions, not chatter.** User preferences, decisions made, constraints,
  requirements — things worth knowing next week. Not "the build passed".
- **\`forget\` is a soft delete.** The content stays retrievable by id but is excluded
  from future searches. Use it when something is wrong or outdated, rather than
  adding a contradicting memory on top.
- **Never store a secret.** Memory is retrievable and displayable.
`,
  },
  {
    topic: "neon",
    title: "The project's own Neon backend",
    summary: "Neon-branch object storage and functions. Dedicated tenancy only.",
    commands: ["neon"],
    source: "skills/workser/reference/neon-backend.md",
    body: `# The project's own Neon backend

S3-compatible object storage and Node.js HTTP functions on the project's own Neon
branch — they branch with the database. **Additive** infrastructure, not a
replacement for \`workser storage\`.

\`\`\`
workser neon status                       # tenancy + toggles + region verdict
workser neon storage list | create <name> | rm <bucket>
workser neon storage ls <bucket> [prefix]
workser neon storage put <bucket> <local> [key]
workser neon storage get <bucket> <key> [dest]
workser neon storage url <bucket> <key>   # temporary download URL
workser neon functions list | deploy <slug> <zip> | rm <slug>
\`\`\`

## Check \`neon status\` first — always

Three things must all be true: **dedicated tenancy**, the capability **switched on**,
and a **supported region**.

Region is fixed when the project is created. \`regionSupportsNeonBackend: false\` is
**final, not retryable** — no amount of waiting or retrying changes it. When you see
it, say so plainly and fall back to \`workser storage\` (the default bucket).

## Notes that matter

- **\`neon storage rm <bucket>\` deletes the bucket and everything in it.** Not
  reversible. Confirm with the user first.
- **\`neon storage url\`** issues a short-lived URL — prefer it to moving large files
  through Workser.
- **Functions deploy from a zip.** Build the bundle first, then
  \`workser neon functions deploy <slug> <zip>\`.
- **Most apps don't need this.** If the user just wants to store uploads, the default
  bucket in \`reference/storage.md\` is the answer.
`,
  },
  {
    topic: "roles",
    title: "Delegate to roles",
    summary: "Hand a focused subtask to another configured local agent.",
    commands: ["agent"],
    source: "skills/workser/reference/roles.md",
    body: `# Delegate to roles

The user can configure **roles** — named specialists each backed by a local CLI agent
(e.g. \`qa\` → codex, \`designer\` → claude_code).

\`\`\`
workser agent list                  # main agent + configured roles + which agents are connected
workser agent run <role> "<task>"   # delegate to a CONFIGURED role (runs isolated)
workser agent spawn <agent> "<task>" [--role <label>] [--instructions <text>] [--model <model>]
                                     # spin up a TEMPORARY teammate on any connected agent CLI
workser agent main                  # show the configured main agent
\`\`\`

## How to use it

Run \`workser agent list --json\` first — it tells you which roles exist, which are
actually runnable on this machine, and which agent CLIs are connected at all
(\`spawnable\`). Delegating to a role that isn't installed, or spawning an agent that
isn't connected, just fails.

\`workser agent run <role> "<task>" --json\` runs a **configured** role as an isolated
local subagent and returns \`{role, agent, output, exitCode}\`.

\`workser agent spawn <agent> "<task>" --json\` does the same thing without a
pre-configured role — \`<agent>\` is one of \`claude_code|codex|kimi|opencode|grok\`, any
of which can be connected on this machine. Use it to fan work out in parallel for
one-off work with no matching role: e.g. spawn \`codex\` to research a topic while you
keep working, or run a second \`claude_code\` instance on a different part of the same
task. \`--instructions\` sets that teammate's system prompt for this one run — give it
real scope, not just a repeat of the task.

- Hand off focused subtasks — review this diff, design this screen, research this API —
  to keep your own context lean and get a specialized second perspective.
- **A non-zero \`exitCode\` means the run failed.** Surface that; don't quietly treat
  empty output as success.
- The subagent doesn't share your context, configured role or spawned. Put everything
  it needs in the task string (and \`--instructions\` for a spawn); it cannot see the
  conversation you're in.
- Never give a subagent — configured or spawned — a task that tells it to delegate or
  spawn further. It has no supervision loop to stop a runaway chain.
`,
  },
  {
    topic: "sdlc-entities",
    title: "Board cards, decisions, requirements, and docs",
    summary: "Read what this project already tracks and decided, keep the Board honest as you work, and record what a future maintainer will need.",
    commands: ["board","decision","requirement","doc"],
    source: "skills/workser/reference/sdlc-entities.md",
    body: `# Board cards, decisions, requirements, and docs

These are the project's memory across sessions. They write to the **same tables**
the Orbit desktop's Board, Project Memory, and Docs panels use, so anything here
appears there too — and (when this CLI runs inside an Orbit-spawned agent run)
as an inline card in the conversation you're working in.

\`\`\`
workser board list [--status <value>] [--label <value>] [--limit <n>]
workser board show <id>
workser board create <title> [--description <text>] [--status <value>]
                              [--priority <value>] [--label <value>]
                              [--owner <name>] [--milestone <id>]
workser board update <id> [--title|--description|--status|--priority
                           |--label|--owner|--milestone ...]
workser board move <id> <backlog|in-progress|in-review|done>
workser board close <id>

workser decision list [--limit <n>]
workser decision show <id>
workser decision create <title> --context <text> --decision <text>
                                 [--consequences <text>]

workser requirement list [--status <value>] [--limit <n>]
workser requirement show <id>
workser requirement create <title> --body <text> [--status <text>]
workser requirement update <id> [--title <text>] [--body <text>] [--status <text>]

workser doc list [--work-item <id>]
workser doc show <id> [--markdown]
workser doc create <title> [--work-item <id>] [--markdown <text>]
                            [--content-json <json>]
workser doc update <id> [--title <text>] [--markdown <text>]
\`\`\`

## Read first — this is the part that matters

Before starting anything beyond a trivial edit:

\`\`\`
workser board list --json          # what's already tracked (don't re-file it)
workser decision list --json       # what was already decided (don't reverse it)
\`\`\`

The project outlives your session. A decision recorded three weeks ago is the
only thing standing between you and quietly undoing a choice someone made on
purpose — \`workser decision show <id>\` gives you the context and consequences,
not just the title. Reach for \`workser doc list\` / \`workser requirement list\`
the same way when the task touches documented behaviour.

## Work with phases → cards + a plan doc, before you build

The moment you split a task into more than one phase, file it — not afterwards,
and not only in your reply, which is gone once the conversation scrolls.

\`\`\`bash
# one card per phase; only the one you're doing goes to in-progress
workser board create "Phase 1 — schema + migration" \\
  --description "Add orders/line_items tables and the migration." \\
  --status in-progress --json
workser board create "Phase 2 — checkout API" --description "…" --json
workser board create "Phase 3 — cart UI"      --description "…" --json

# the plan itself, ONE doc, deliberately NOT linked to a card
workser doc create "Checkout — implementation plan" --markdown "$(cat plan.md)" --json

# the approach, if the plan settled something with real alternatives
workser decision create "Carts live server-side" --context "…" --decision "…" --json
\`\`\`

**Don't pass \`--work-item\` for a multi-phase plan.** A linked document renders on
its card and is *hidden* from the Docs panel; a plan spanning three phases belongs
to the project, not to phase 1.

The bar: if the user closed this conversation now, the Board should still show
what's left and the doc should still explain the plan to whoever continues it.

## Keep the Board honest while you work

A Board still reading \`backlog\` after the feature shipped tells the user the
opposite of the truth. Moving the card is part of finishing the work:

\`\`\`
workser board move <id> in-progress   # you picked it up
workser board move <id> in-review     # ready for the user to look at
workser board close <id>              # done and verified
\`\`\`

\`--status\` is one of \`backlog | in-progress | in-review | done\` (default
\`backlog\`). \`--priority\` is one of \`low | normal | high | urgent\` (default
\`normal\`). \`--label\` repeats for more than one label:

\`\`\`
workser board create "Fix the login bug" --status in-progress --priority high \\
  --label bug --label auth
\`\`\`

\`board update\` replaces the labels you pass rather than merging them, and
touches only the fields you name. There is no \`board delete\` — \`done\` is the
terminal state for finished work, and removing a card the user filed is theirs
to do in Orbit.

## Decisions are append-only

\`decision create\` is for something with real tradeoffs worth a paper trail:
\`--context\` is why it came up, \`--decision\` is what was decided,
\`--consequences\` is the follow-on effects. There is deliberately **no
\`decision update\`** — a decision record states what was decided at a point in
time. When it stops being right, record a new decision that supersedes it and
say so in its \`--context\`. Editing the history is how a decision log stops
being worth reading.

Requirements are different: they legitimately move along, so they do have
\`update\`.

\`\`\`
workser requirement create "Support SSO" --body "Enterprise customers need SAML." \\
  --status proposed
workser requirement update <id> --status done
\`\`\`

## Docs

\`--markdown\` is the normal way to write one. The body is stored both as the
rich-text content the Docs panel renders and as a git-tracked markdown mirror
at \`.workser/docs/<id>.md\` — \`workser doc show <id> --markdown\` reports that
path so you can read the file with your normal tools.

Revise the page that exists rather than creating a second copy of it:

\`\`\`
workser doc list --json                       # is there already a page for this?
workser doc update <id> --markdown "$(cat updated.md)"
\`\`\`

\`--work-item <id>\` links a document to a Board card (a card has at most one).

## When to record, and when not to

Record what a future maintainer would need: follow-up work you found but didn't
do, a choice between real alternatives, a behaviour worth writing down. Don't
narrate every small step — and never treat filing a card as a substitute for the
work. A card saying "fix the bug" is not fixing the bug.
`,
  },
  {
    topic: "search",
    title: "Web search",
    summary: "Google-grounded web search, run server-side — the API key never reaches you.",
    commands: ["search"],
    source: "skills/workser/reference/search.md",
    body: `# Web search — ask the internet, not just the model

\`\`\`
workser search "<query>" [-n, --max-results <n>]   # Google-grounded web search
\`\`\`

## Why this exists

A local agent can drive a browser, but it can't "search the web" without a URL
already in hand — \`browser\` automation needs somewhere to point. This runs a
real, grounded Google search server-side (core-api holds the API key; it never
reaches the daemon, the CLI, or you) and returns a synthesized answer plus the
source links behind it.

## Using it well

- Prefer this over guessing or asking the user when you need current facts,
  prices, docs for a library, or anything time-sensitive.
- The \`answer\` is a synthesized summary — the \`results\` list is the sources it
  drew from. Cite or open one of those links if the user needs to verify the
  claim themselves.
- Not project-scoped: it's a general research tool, not tied to a project's data.
`,
  },
  {
    topic: "storage",
    title: "File storage",
    summary: "The project's default bucket — upload, list, download.",
    commands: ["storage"],
    source: "skills/workser/reference/storage.md",
    body: `# File storage

The project's default bucket (Cloudflare R2 behind Workser). Every project gets one;
\`create\` is idempotent.

\`\`\`
workser storage create [name]       # provision the bucket (idempotent)
workser storage list                # the project's bucket
workser storage ls [prefix]         # list objects in the bucket
workser storage put <local> <key>   # upload a file into the bucket
workser storage get <key> [dest]    # download an object (or print its URL)
\`\`\`

## Notes that matter

- **One bucket per project, shared by its apps.** Namespace your keys by app or
  feature (\`invoices/2026/…\`) rather than assuming the root is yours.
- **\`storage get\` with no destination prints a URL** instead of writing a file —
  useful when you just want to hand the user something to click.
- **This is not where app uploads should go through you.** At runtime the app uses
  \`workser.storage\` from \`@workser/app\`, and for anything large it should request a
  presigned upload URL so the bytes never pass through Workser. See the
  \`workser-sdk\` skill.

## Not the same as \`workser neon storage\`

\`storage\` is the default R2 bucket every project has. \`neon storage\` is additive
infrastructure on the project's own Neon branch, available only on dedicated tenancy
in a supported region. They are different stores — a file put in one is not visible
in the other. See \`reference/neon-backend.md\`.
`,
  },
  {
    topic: "version-control",
    title: "Saving, undoing & syncing your work",
    summary: "Checkpoint before risky edits, restore when they go wrong, sync with Workser.",
    commands: ["checkpoint","restore","sync"],
    source: "skills/workser/reference/version-control.md",
    body: `# Saving, undoing & syncing your work

\`\`\`
workser checkpoint ["what you're about to try"]  # save the folder as it stands now
workser restore                                  # go back to the newest checkpoint
workser restore --list                           # see the checkpoints you can go back to
workser restore <ref>                            # go back to a specific one
workser sync [--branch dev] [--app <id>]         # reconcile this folder with Workser
\`\`\`

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
| \`git stash\` | \`workser checkpoint\` |
| \`git commit\` | \`workser checkpoint\` |
| \`git reset --hard\` / \`git checkout .\` | \`workser restore\` |
| \`git pull\` / \`git push\` | \`workser sync\` |

Reading is always fine: \`git log\`, \`git diff\`, \`git show\`, \`git status\`.

## Notes that matter

- **Checkpoint before anything you might want to take back** — a refactor across
  many files, a dependency upgrade, deleting something large. It costs a second.
- **\`git stash\` is the one that actually loses work.** Workser publishes what is
  on disk, so a deploy while your changes are stashed ships the version *without
  them* — and if the run is stopped between \`stash\` and \`stash pop\`, the user
  opens their folder and their work is gone. \`workser checkpoint\` has neither
  failure mode.
- **Restoring never discards anything.** The current state is saved first, then
  the older state is restored on top. If you restore the wrong thing, restore
  again. Say this to the user — it is the reason they can afford to say yes.
- **These are the same checkpoints as the app's Undo button.** One history, not
  two: a checkpoint you take here appears in Workser, and vice versa.
- **\`sync\` pulls before it pushes.** If it reports \`diverged\`, both sides changed
  and it stops rather than picking a winner — tell the user to resolve it in
  Workser instead of forcing it.
- **These three need the Workser app running on this computer**, because they
  work with files. If you get \`needs_local_app\`, you are on a machine that only
  has the CLI and a token — say so rather than looking for a workaround. Every
  read-only command (\`projects\`, \`env\`, \`db\`, \`logs\`, \`status\`) still works.

## Shipping is separate

\`workser sync\` reconciles the folder. \`workser deploy\` puts it in front of
users. Syncing does not deploy, and deploying does not require you to sync
first — deploy publishes what is on disk. See \`reference/deploy.md\`.
`,
  },
];
