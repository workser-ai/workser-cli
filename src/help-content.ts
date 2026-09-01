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
    topic: "analysis",
    title: "Analysis — running Python on this project's data",
    summary: "Run pandas locally under a sandbox and a clock, so the code, the output and the timing land in the task where the owner can see them.",
    commands: ["analysis"],
    source: "skills/workser/reference/analysis.md",
    body: `# Analysis — running Python on this project's data

\`\`\`
workser analysis runtime [--app <webAppId>]
workser analysis run --app <webAppId> --file report.py [--timeout <ms>]
workser analysis run --app <webAppId> --code 'print(1)'
\`\`\`

## Why not just run \`python\` yourself

Two reasons, and the second matters more.

It runs inside the same OS sandbox a structured agent run gets, scoped to the
app's own folder — so a script that goes wrong goes wrong in one directory.

And it is **recorded**. The code, the output and how long it took land in the
task, where the owner can see them. An analysis nobody can see is an assertion,
which is the same problem \`workser api call\` solves for a service with no
screen. If a number is going to end up in front of the customer, run it here.

## Check the runtime before you write the script

\`\`\`
workser analysis runtime --app <id> --json
\`\`\`

It reports the interpreter that would be used — the app's own \`.venv\` first, if
it has one — and whether \`pandas\` and \`matplotlib\` are importable. Exit code is
non-zero when Python is missing, so you find out in a second rather than after
writing a hundred lines.

## Limits, said plainly

Five minutes by default, fifteen at most. Output is capped per stream and
truncation is reported. Nothing is silently dropped.

These are local limits and they are the right ones: this work does **not** go in
a deployed function. \`maxDuration\` is for a slow request; an analysis reads a lot
of rows and takes as long as it takes, so putting it behind a serverless timeout
means the useful analyses are exactly the ones that fail.

## What counts as evidence

A number on its own is not a finding. When you report a result, say what the
query was, how many rows it covered, and what window of time — a figure with no
denominator is the easiest thing in this product to get wrong and the hardest
for the owner to check.
`,
  },
  {
    topic: "api",
    title: "Services — calling one, and describing it",
    summary: "Call this project's API through the same console the owner sees, and make sure every route it serves is written down before you call the task done.",
    commands: ["api"],
    source: "skills/workser/reference/api.md",
    body: `# Services — calling one, and describing it

A service has no screen. Everything else you build can be looked at; an API can
only be *called* — so unless the calls go somewhere the owner can see, "the API
works" is an assertion with nothing behind it.

\`\`\`
workser api list  [--app <webAppId>]
workser api call <path> [--app <id>] [--method <verb>] [--body <text>]
                        [--header 'Name: value'] [--env local|preview|production]
workser api spec  [--check]
\`\`\`

## Call it through the console, not through curl

\`workser api call\` goes through the same request console the owner has open. The
status, the timing and the body you see are the ones they see, and the
credentials come from the app's own environment rather than from your command
line — so a token never lands in a transcript.

\`\`\`
workser api call /orders --app <id> --json
workser api call /orders --app <id> --method POST --body '{"item":"latte"}' --json
\`\`\`

\`--env\` picks which copy to call. \`local\` is the dev server on this machine and
is the default; \`preview\` and \`production\` are the deployments. The host always
comes from that choice — a path is a path, never a URL, and passing one is
refused.

Exit code: non-zero only when nothing answered. A 404 or a 422 is a *successful*
call with an informative answer, so checking that a route correctly rejects bad
input works exactly as you would expect.

## Save the calls that matter

Requests saved at \`api/requests.json\` in the service's repo show up in the
owner's console. Write the handful that describe what the service does — not a
test suite:

\`\`\`json
[
  { "id": "list-orders", "name": "List today's orders", "method": "GET",
    "path": "/api/orders", "note": "What the shop screen loads." },
  { "id": "place-order", "name": "Place an order", "method": "POST",
    "path": "/api/orders", "body": "{\\"item\\":\\"latte\\"}" }
]
\`\`\`

They are in the repo on purpose: a call worth saving outlives the session that
saved it, and it shows up in the diff.

## Describe every route before you call it done

\`\`\`
workser api spec --check
\`\`\`

It compares the routes the repo actually serves — read from the file layout, so
it cannot be fooled by a comment — with the paths your OpenAPI document
declares, and fails when one is missing. Write the document at
\`api/openapi.json\` (YAML also works).

It is not an OpenAPI validator and does not check schemas or responses. It asks
one question, so that it is cheap enough to run every time: is every route
written down. A health probe is exempt. A path in the spec that the repo does
not serve is reported but does not fail — you may be documenting something
built next.

Run it alongside \`workser verify\` before declaring an API task finished. An API
somebody can call and an API somebody can integrate with are different products,
and the spec is the difference.
`,
  },
  {
    topic: "automation",
    title: "Workflows & connected apps",
    summary: "Build automations that outlive the run; use Gmail, Slack, Stripe, Sheets.",
    commands: ["workflow","connection"],
    source: "skills/workser/reference/automation.md",
    body: `# Workflows & connected apps

Wire up **automations** that keep running after you're done, and use third-party
accounts (Gmail, Slack, Stripe, Google Sheets) the project has connected.

\`\`\`
workser workflow list | create <name> [--body <json>] | get <id>
workser workflow activate <id> | deactivate <id> | run <id> [--wait] [--body <json>]
workser workflow runs <id>          # past executions of a workflow
workser workflow nodes [query]      # search the node-type catalog

workser connection list [--toolkit <slug>]  # connectable + connected third-party apps
workser connection search "<query>" [--toolkit <slug>] [--limit N]  # find an action across every toolkit
workser connection connect <toolkit> | disconnect <connectionId>
workser connection tools <toolkit>          # browse one connected toolkit's actions
workser connection run <toolSlug> [--body <json>]  # execute one action
\`\`\`

## Building a workflow

\`workser workflow create\` builds an event-driven, multi-step automation — the same
engine Workser's own web Workflow tab uses. Nodes, connections and triggers go in
\`--body\` as JSON.

**Browse \`workser workflow nodes\` first.** Inventing a node type that doesn't exist
produces a workflow that saves and then never runs.

Created workflows start inactive: \`workser workflow activate <id>\` when it's ready.

## Using a connected app

1. \`workser connection list\` — check what's already connected before asking for anything.
2. If it isn't: \`workser connection connect <toolkit>\` returns an OAuth link. The **user**
   must open it; you cannot complete OAuth on their behalf. Wait, then continue.
3. Don't know the exact action? \`workser connection search "<query>"\` finds it across
   every toolkit; \`workser connection tools <toolkit>\` browses one toolkit you already
   know. Either way, read the argument schema rather than guessing field names.
4. \`workser connection run <toolSlug> --body '{"…":…}'\` — e.g. \`GOOGLESHEETS_APPEND_ROW\`,
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

## The three places design lives — and which one you are in

They are separate on purpose, and confusing them is the commonest mistake here.

| What | Scope | Where |
| --- | --- | --- |
| **Brand** — colours, fonts, logo | The **project** | \`business_settings\`, read with \`design show\` |
| **Design files** — the \`.fig\` work | The **project**, many files | the project's design workspace folder |
| **Layout options** — choices to show the owner | **One app** | \`design/options.json\` in that app's folder |

**Design is not an app.** It has no port, no URL, nothing to deploy. Never create
an app for it.

When you write \`design/options.json\`, put the design file each option came from
in a \`source\` field:

\`\`\`json
{ "options": [
  { "id": "warm", "name": "Warm and simple", "route": "/",
    "note": "Bigger type, more space.", "source": "hero-v2.fig" }
] }
\`\`\`

\`source\` is a path **inside the project's design workspace** — relative, no
\`..\`, no absolute paths, no URLs. Anything else is dropped. Leave it out when the
option was written straight into code with no design file behind it; that is an
ordinary case and inventing a source is worse than omitting one.

Why it matters: the owner picks an option in one app and later opens the design
workspace. Without \`source\`, nothing connects the decision they just made to the
file it came from, and "why does the site look like this?" has three unrelated
answers.
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
    topic: "checks",
    title: "Checks — is it safe, and is it still up",
    summary: "Scan the code for leaked secrets, known-bad dependencies and over-broad permissions, and check that what you published is still answering.",
    commands: ["scan","health"],
    source: "skills/workser/reference/checks.md",
    body: `# Checks — is it safe, and is it still up

Two questions nothing else in this CLI asks. \`verify\` tells you the code
compiles. These tell you it is not dangerous, and that it is still working an
hour after you shipped it.

Run both before you say a task is done.

\`\`\`
workser scan                      # deps · secrets · permissions, over this folder
workser scan --check              # same, but exits non-zero on anything serious
workser scan --only secrets       # one check: deps, secrets, permissions
workser scan --staged             # look at staged changes only

workser health                    # is every published app still answering?
workser health --app <webAppId>   # just one
\`\`\`

## scan

Three checks, all local — no login, no project, no network except for \`deps\`.

**secrets** looks at what your changes ADD (\`git diff HEAD\`), not at the whole
tree, so it fires on the key you just wrote rather than on every example file
forever. It knows the shapes that are actually credentials — AWS, GitHub,
Stripe, OpenAI, Anthropic, Google, Slack, private keys, database URLs with a
password in them, and \`API_KEY = "…"\` with something real on the right. It
ignores placeholders (\`your-api-key\`, \`process.env.X\`, \`<REPLACE_ME>\`) and
example, fixture and lockfile paths.

**deps** runs \`npm audit\` and reports high and critical only. Moderate and low
advisories on transitive dev dependencies are real and are not worth a report
nobody finishes reading.

**permissions** catches three specific mistakes: a \`NEXT_PUBLIC_…SECRET\`
compiled into the browser bundle, an API that accepts credentialed requests
from any website, and a real \`.env\` committed to the repository.

**A check that could not run says so.** Offline, \`deps\` reports "not checked"
with the reason — never "nothing found". If you are quoting a scan result, quote
what it checked as well as what it found.

If it finds a secret: move the value to \`workser env set\`, and treat the old one
as leaked. Rotating it is the owner's decision, not yours — say so and let them.

## health

Probes the stable preview and production addresses of every app in the project
and reports up or down, with the round trip. It exits non-zero if anything is
down, so a step can gate on it.

Two things worth knowing:

* It is the same check the desktop runs on a timer. Both fold into one streak,
  so a run of yours counts toward the same total.
* After three failed checks in a row on a **production** address that has
  worked before, an incident task is opened on the owner's board automatically.
  A preview address is checked and reported but never escalated — it is not
  customer-facing, and waking the owner for it teaches them to ignore the ones
  that are.

An app that has never been published has no address, so there is nothing to
check. That is reported as a note, not as a pass.
`,
  },
  {
    topic: "cloud-agents",
    title: "Ship an agent inside the app",
    summary: "Create an AI agent that runs on Workser and can be called from this project's apps.",
    commands: ["cloud-agent"],
    source: "skills/workser/reference/cloud-agents.md",
    body: `# Ship an agent inside the app

\`workser cloud-agent\` creates an AI agent that runs on **Workser's**
infrastructure, keeps its own memory and tools, and can be called from the web,
mobile, API or Python apps in this project.

**This is not \`workser agent\`.** That one hands a subtask to a coding agent on
this machine — a teammate helping you build. This one is a thing the project
*ships*: it works for the user after you are gone.

\`\`\`
workser cloud-agent list
workser cloud-agent create "Order desk" --instructions "..."
workser cloud-agent show <agentId>
workser cloud-agent run <agentId> "<what to do>"
workser cloud-agent runs <agentId>        # recent runs
workser cloud-agent runs <runId>          # one run, with what it cost
\`\`\`

Every call is scoped to the project this folder belongs to.

## When to reach for this

When the user describes a job that **keeps happening** and needs judgement:
"check every order for stock and email me the problems", "read the LINE
messages and file them", "reconcile these invoices". That is an agent.

A one-off transformation is not an agent — write the code. A fixed sequence of
steps with no judgement in it is not an agent either — that is \`workser
workflow\`.

## Calling it from the app you are building

Do NOT shell out to the CLI from app code. Use the SDK, which streams:

\`\`\`ts
import { workser } from '@workser/app';

const run = await workser.agents.run(agentId, { message }, {
  referenceUserId: user.id,   // who it is acting for
});

for await (const event of workser.agents.stream(run.id)) {
  // event.type, event.data — forward these to the browser
}
\`\`\`

\`stream()\` reconnects itself through dropped connections, so the person
watching sees the agent think. See the \`workser-sdk\` skill, \`reference/agents.md\`.

## Things that will bite you

1. **A run costs money by the minute.** It is metered — runtime, workspace, and
   a per-run fee — so a loop that starts agents is a loop that spends. Cancel
   what you abandon: \`workser cloud-agent runs <runId>\` shows the cost.

2. **Instructions are the product.** The agent does what its instructions say,
   in the user's own words. Write them the way you would brief a new colleague:
   what to do, what to leave alone, when to ask. Vague instructions are the
   single biggest cause of an agent that "doesn't work".

3. **Free plans cannot run agents at all**, and a trial has a small allowance.
   A \`402\` with \`spend_limit_reached\` is not a bug — tell the user what it says
   and point them at their plan.

4. **Say who it is for.** An agent acting for one of the app's customers needs
   \`referenceUserId\`, or its memory and audit trail belong to nobody.

5. **Do not invent an agent the user did not ask for.** Creating one is cheap;
   an agent nobody wanted, quietly costing money per run, is not.
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
  command, clicking or typing may return \`awaiting_approval\` (exit 5) — this is
  usually an unattended run, so nobody is necessarily watching for it. Say plainly
  that it needs approval in Orbit and **stop this turn**. Never write a retry loop,
  a polling script, or a sleep-and-recheck command around it — that spends the whole
  run spin-waiting on a click and will simply time out. The same command works on
  its own, the next time it runs, once approved.
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
  \`awaiting_approval\` (exit 5). Say it needs approval in Orbit and stop this turn —
  don't loop or poll waiting for it; the same command works once it's approved.
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
workser artifact add <path> --kind <shape> --data <json> [--promote]
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

## The shapes the task draws as cards

Most kinds say what kind of FILE something is. A few say what the user **asked
for**, and those get a card of their own on the task:

| \`--kind\` | What the card shows | \`--data\` it reads |
|---|---|---|
| \`report\` | the chart behind a number | — |
| \`walkthrough\` | the flow, as frames | \`frames\` |
| \`before_after\` | a wipe between two pictures | \`shots: [{url,label}, …]\` |
| \`checks\` | what was tested | \`passed\`, \`total\` |
| \`web_app\` | a published app | \`deployedAt\`, \`pagesChanged\` |
| \`service\` | a job and what it reaches | \`nextRun\` |
| \`design\` | a layout | — |

\`\`\`
workser artifact add ./checks.json --kind checks --data '{"passed":12,"total":12}'
workser artifact add --url https://acme.workser.app --kind web_app \\
  --data '{"deployedAt":"2026-08-20T14:02:00Z","pagesChanged":3}'
\`\`\`

**Every \`--data\` field is optional, and a missing one is left off the card — it
is never drawn as zero.** \`0 pages changed\` is a claim you cannot support and
reads as "it did nothing"; saying nothing reads as "not measured", which is
true. Only pass a figure you actually counted.

## Handing something up to the task

\`--promote\` marks an artifact as one of the things the user asked for, so it
appears on the task itself instead of inside your step.

Use it when you know: the report they wanted, the app you published, the
document explaining what changed. Do **not** promote working material —
screenshots you took to check your own work, intermediate exports, a scratch
file. A task that hands up everything buries the six things they wanted under
sixty they did not.

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
    title: "Deploy, addresses & logs",
    summary: "Ship the app, find its address, and find out why it is down.",
    commands: ["deploy","logs","versions","urls","deployments","domain","open","verify"],
    source: "skills/workser/reference/deploy.md",
    body: `# Deploy, environment variables & logs

Getting the app online and configured, and finding out why it isn't.

\`\`\`
workser deploy [--env production] [--watch]   # deploy (git → Vercel); default is preview
workser deploy status [id]          # status of a deploy (default: latest)
workser urls                        # every app's stable preview + live address
workser logs [-n 100] [-f] [--env production] [--app <id>]
workser versions [--env production] # history; the badge says which env is live
workser deployments list [--env production] [--app <id>]
workser deployments inspect <id> [--logs]
workser deployments promote         # ship the latest build (the owner confirms)
workser deployments rollback <version>  # put an earlier one back (the owner confirms)
workser domain list                 # custom domains
workser domain add shop.co.th       # attach one (the owner confirms)
workser domain add app.shop.co.th --app <webAppId>
workser domain rm shop.co.th        # detach one (the owner confirms)
workser open                        # open the live app
workser verify                      # run typecheck/lint/build

\`\`\`

Settings — \`workser env\` — are their own topic: \`workser help env\`.

## Notes that matter

- **\`verify\` gates "done".** Run \`workser verify --json\` before you say a task is
  finished. \`"ok": false\` means fix the listed errors and re-run — a green build is
  the bar, not your reading of the diff.
- **\`deploy\` without \`--env\` is a preview.** Preview first when the change is
  risky; \`--env production\` (or the older \`--prod\`, which means the same) puts it
  in front of real users. Passing both, disagreeing, is refused rather than
  resolved.
- **\`urls\` is where the address comes from — not the deploy response.** The host
  in a deploy response is per-build and the next deploy retires it. \`urls\`
  returns the stable ones, and says why an app has none rather than printing a
  blank.
- **\`promote\` and \`rollback\` are the same upstream call and two commands on
  purpose.** Promote ships the newest build; rollback puts version N back. Both
  ask the owner and return exit 7 (\`awaiting_approval\`) until they answer — and
  that gate holds even on a "just do it" run. Say so and stop this turn; don't
  loop or poll for the answer (see the \`awaiting_approval\` note below).
- **There is no \`deployments cancel\`.** Nothing upstream can stop a build that is
  already running. Wait for it and then promote or roll back.
- **\`--watch\` blocks until there's a live URL.** Without it you get a deploy id and
  have to poll \`deploy status\`.
- **\`domain add\` and \`domain rm\` ask the owner to confirm** and return exit 7
  (\`awaiting_approval\`) until they do — say plainly that it needs approval in
  Orbit and stop this turn; the same command works on its own once it's approved,
  so don't write a retry loop or poll for it. Domains Workser owns (\`workser.ai\`
  and its subdomains) and hostnames the hosting provider assigns (\`*.vercel.app\`)
  are refused outright: those are not attachable, and the app's own preview and
  live URLs already exist without attaching anything.

## After a successful deploy

Register the URL so it shows up on the user's task:

\`\`\`
workser artifact add --url https://acme.workser.app --kind app -t "Storefront"
\`\`\`

See \`reference/deliverables.md\`.
`,
  },
  {
    topic: "docs",
    title: "Project documents",
    summary: "Write and revise the project's pages, keep the markdown mirror readable, and put the diagram in the document rather than in your reply.",
    commands: ["doc"],
    source: "skills/workser/reference/docs.md",
    body: `# Project documents

A document is a page in the project's Docs panel and a git-tracked markdown
mirror at \`.workser/docs/<id>.md\`. Both are the same document: the panel renders
the rich text, the mirror is what you, git and the next agent can read as text.

\`\`\`
workser doc list [--work-item <id>]
workser doc show <id> [--markdown]
workser doc create <title> [--work-item <id>] [--markdown <text>]
                            [--content-json <json>]
workser doc update <id> [--title <text>] [--markdown <text>]
workser doc diagram <id> [--check]
\`\`\`

## Revise the page that exists

The project outlives your session, and a second copy of a page is worse than no
page — nobody can tell which one is current.

\`\`\`
workser doc list --json                       # is there already a page for this?
workser doc update <id> --markdown "$(cat updated.md)"
\`\`\`

\`workser doc show <id> --markdown\` reports the mirror's path so you can open the
file with your normal tools instead of reconstructing prose from blocks.

\`--work-item <id>\` links a document to a Board card (a card has at most one). A
linked document renders on its card and is *hidden* from the Docs panel, so a
plan spanning several phases should stay unlinked — it belongs to the project,
not to phase 1.

## Put the diagram in the document

A page explaining how something fits together should contain the picture, not a
paragraph describing one. Write it as a \`\`\`mermaid fence in the markdown: the
Docs panel renders it, \`git diff\` shows it as changed lines, and the next agent
reads it without a screenshot.

\`\`\`
workser doc diagram <id> --check     # exits non-zero when the page has none
\`\`\`

Use \`--check\` on any page whose job is to explain a structure — an architecture
page, a data model, a flow. It reads the mirror on disk rather than the block
content, which is deliberate: a diagram that exists in the editor but not in the
mirror is invisible to git, to you, and to whoever opens the file next.
`,
  },
  {
    topic: "env",
    title: "Settings — cloud, per environment, and on this computer",
    summary: "Set and read an app's settings, hold a different value in production, and pull them onto this computer without clobbering local ones.",
    commands: ["env"],
    source: "skills/workser/reference/env.md",
    body: `# Settings — cloud, per environment, and on this computer

\`\`\`
workser env set KEY=VALUE [K2=V2…] [--env production]
workser env list [--env production]      # keys, masked; marks where they differ
workser env get KEY [--env production]   # one value (sensitive)
workser env pull [--env production] [--overwrite]
\`\`\`

## \`--env\` — say which environment you mean

\`deploy\`, \`logs\` and \`versions\` take \`--env preview\` or \`--env production\`.
\`env set\` takes those and \`--env development\` as well.

Without it: \`deploy\` builds a preview, \`logs\` and \`versions\` talk about
whichever deployment is newest, and \`env set\` writes to all three environments.
Those are the old defaults and they have not changed.

**There is no development deployment.** Nothing is ever built into it — it is
the environment the app uses when it runs on this computer — so \`deploy --env
development\` and \`logs --env development\` are refused rather than quietly shown
preview.

**A key can now hold a different value per environment.** \`env set --env
production DATABASE_URL=…\` writes an override; every other environment keeps
the shared value. \`env list --env production\` and \`env get KEY --env production\`
read it back.

Without \`--env\` you get the **shared** value — what the key is everywhere unless
overridden — and \`env list\` marks which keys differ:

\`\`\`
API_KEY = sk-•••   (different in production)
\`\`\`

That marker is the one to read before changing anything: editing the shared
value will not touch production if production has its own.

\`env rm KEY --env production\` removes just that override and the key keeps its
shared value. \`env rm KEY\` removes the key entirely.

## Local settings are this computer's, and are not overwritten

\`env pull\` writes into the app folder's own env file — \`.env\` for most runtimes,
\`.env.local\` for Next.js, because that is the file each one actually reads.

**It fills in what is missing and leaves what is already there alone.** A local
\`DATABASE_URL\` usually points at the developer's own database on purpose;
replacing it because somebody asked to pull one missing key destroys work
Workser cannot give back. Keys it left alone are **named** in the output.

\`\`\`
workser env pull                    # fill the gaps, touch nothing else
workser env pull --env production   # fill them from production's values
workser env pull --overwrite        # replace local values too
\`\`\`

Starting an app for the first time does the same thing automatically, with the
same rule.

## A key can hold a different value per environment

\`workser env set --env production DATABASE_URL=…\` writes an override; every
other environment keeps the shared value.

Without \`--env\` you get the **shared** value — what the key is everywhere unless
overridden — and \`env list\` marks which keys differ:

\`\`\`
API_KEY = sk-•••   (different in production)
\`\`\`

Read that marker before changing anything: editing the shared value will not
touch production if production has its own.

\`env rm KEY --env production\` removes just that override and the key keeps its
shared value. \`env rm KEY\` removes the key entirely.

## Local settings are this computer's, and are not overwritten

\`env pull\` writes into the app folder's own env file — \`.env\` for most runtimes,
\`.env.local\` for Next.js, because that is the file each one actually reads.

**It fills in what is missing and leaves what is already there alone.** A local
\`DATABASE_URL\` usually points at the developer's own database on purpose;
replacing it because somebody asked to pull one missing key destroys work
Workser cannot give back. Keys it left alone are **named** in the output.

\`\`\`
workser env pull                    # fill the gaps, touch nothing else
workser env pull --env production   # fill them from production's values
workser env pull --overwrite        # replace local values too
\`\`\`

Starting an app for the first time does the same thing automatically, with the
same rule.

## Notes that matter

- **\`env set\` writes a value you never see.** That's the point — when the user
  has a secret, have them run it (or set it in Orbit) rather than pasting it to
  you.
- **\`env get\` returns a secret.** Don't echo it into the conversation.
- **\`env rm\` is owner-only** (exit 6). Tell the user to do it in Orbit; don't
  look for a workaround.
- **Cloud and local are different environments.** \`env set\` configures the
  cloud; the files in the app folder configure this computer. Don't hand-edit
  one to change the other.
`,
  },
  {
    topic: "goals",
    title: "Business goals & phases",
    summary: "The level above a task — a business requirement too big for one sitting, and the ordered phases that deliver it.",
    commands: ["goal"],
    source: "skills/workser/reference/goals.md",
    body: `# Business goals & phases

A **goal** is a business requirement — "customers can buy from my site" — that
does not fit in one task. It carries an ordered list of **phase names**; a task
joins one by carrying that name (\`workser task create --goal <id> --phase <name>\`).
A phase has no existence apart from the tasks inside it, so it cannot drift from
the work it names.

\`\`\`
workser goal list
workser goal show <id>
workser goal create <title> --phase <name...> [--outcome <text>]
                            [--criteria <json>]
workser goal update <id> [--title <text>] [--outcome <text>]
                         [--phase <name...>] [--status <value>]
workser goal check <id> <criterionId> --phase <name> (--pass|--fail|--reset) [--note <text>]
\`\`\`

Status is one of: proposed, agreed, working, delivered, abandoned.

## A goal has to be argued for

Most requests are one task and should stay one task. Turning a two-hour job into
four milestones buries the owner in ceremony before anything is built — use
\`workser task create\` unless you can genuinely name two-plus slices that each
deliver something the owner would notice.

\`\`\`
workser goal create "Launch checkout" \\
  --phase "Cart" --phase "Payment" --phase "Receipts" \\
  --outcome "A customer can buy something and get a receipt"
\`\`\`

\`--phase\` needs 2–6 names. Propose the shape only — nothing is created until the
owner agrees it; planning phase four now is waste, since it will change once
phase one is real.

## Acceptance criteria are agreed with the shape

\`--criteria\` maps each phase name to the owner's own sentences about what "done"
means for it, e.g. \`'{"Payment":["A customer can pay by card and gets a receipt"]}'\`.
Written afterwards they only describe what got built; written with the shape they
can still change the plan.

Record whether one is met with \`workser goal check\`:

\`\`\`
workser goal check g_123 c1 --phase Payment --pass \\
  --note "Tested a card payment end to end; receipt emailed."
\`\`\`

\`--note\` is required on \`--pass\` — a tick the owner cannot verify is worse than no
tick.

## Joining tasks to a goal

\`\`\`
workser task create "Build the payment form" --goal g_123 --phase Payment
\`\`\`

A goal's apps and progress are derived from the tasks that join it, not declared
up front — most of the apps a goal will touch don't exist when it's proposed.
`,
  },
  {
    topic: "images",
    title: "Image generation & media understanding",
    summary: "Generate images from a prompt; describe/transcribe an image, video, or audio clip you can't natively see or hear.",
    commands: ["image","video","audio"],
    source: "skills/workser/reference/images.md",
    body: `# Image generation & media understanding

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

## Notes that matter (generation)

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

## Understanding media you can't natively see or hear

The fallback for a text-only model, or media you have no other way to reach: describe
an image, summarize/transcribe a video, transcribe/describe audio. Runs server-side
(Gemini) — you never need a model key.

\`\`\`
workser image understand "<query>" [--url <u> | --file <p>] [-t <task>]
workser video understand "<query>" [--url <u> | --file <p>] [-t <task>]
workser audio understand "<query>" [--url <u> | --file <p>] [-t <task>]
\`\`\`

\`\`\`bash
workser image understand "what's wrong with this layout?" --url https://…/screenshot.png --json
workser video understand "what happens at the end?" --url https://youtu.be/… -t timestamp_analysis --json
workser audio understand "transcribe this" --file ./voicemail.m4a -t transcribe --json
\`\`\`

## Notes that matter (understanding)

- **\`--url\` vs \`--file\`**: \`--url\` is fetched server-side with no size ceiling — the
  right choice for anything already hosted (a project's own storage bucket, a public
  link, a YouTube URL for video/audio). \`--file\` is read and sent inline by the CLI
  itself, so it's bounded by the daemon's own request-size limit — for a small local
  file only (a screenshot, a short voice memo). Something bigger: \`workser storage
  upload\` it first, then pass the returned URL with \`--url\`.
- **\`-t/--task\` shapes the answer, it doesn't gate what you can ask** — \`general\` (the
  default) takes any free-form \`<query>\`. The other values just bias the prompt
  toward a specific shape: \`caption\`/\`visual_qa\`/\`object_detection\`/\`segmentation\`
  for images; \`summarize\`/\`describe\`/\`visual_qa\`/\`timestamp_analysis\` for video;
  \`transcribe\`/\`describe\`/\`audio_qa\`/\`speaker_diarization\`/\`emotion_detection\` for
  audio.
- **This is billed to the project's organization**, same as image generation — it's
  a real provider call, not free introspection. Don't loop it over every file in a
  folder "just in case"; use it when you actually need to know what's in one.
`,
  },
  {
    topic: "key",
    title: "Managed keys — list and rotate this app's Workser-issued credentials",
    summary: "See this app's AI Gateway and auth keys (redacted), and rotate one without opening Orbit.",
    commands: ["key"],
    source: "skills/workser/reference/key.md",
    body: `# Managed keys — list and rotate this app's Workser-issued credentials

\`\`\`
workser key list [--app <webAppId>]
workser key rotate <key> [--app <webAppId>] [--env production|preview]
\`\`\`

App-scoped, not project-scoped: run from the app's own folder and \`--app\` is
picked up automatically; from anywhere else, pass \`--app <webAppId>\` — a
mistake here is the wrong app's key, so there is no "primary app" default the
way \`env\` has one.

## What's rotatable

Only credentials with a real rotation handler:

- \`AI_GATEWAY_API_KEY\` — the deployed agent's key into the Workser AI
  Gateway. Split by environment (\`--env production\` or \`--env preview\`
  required), so rotating one never touches the other.
- \`BETTER_AUTH_SECRET\` — a single value, no \`--env\` needed.

Every other Workser-managed value (\`DATABASE_URL\`, the internal service
keys) has no rotation handler yet — each belongs to a different subsystem
with its own cutover semantics, and \`key rotate\` refuses rather than fake
one.

## After rotating

The old value stops authorizing immediately, server-side. An already-running
deployment keeps using whatever it was built with until it's redeployed —
run \`workser deploy\` (\`--prod\` for the production key) to pick up the new
value. \`key rotate\` prints the new secret exactly once; it is never shown
again or stored anywhere in the clear.
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
    title: "The project's own database",
    summary: "Branches, databases, compute, plus Neon-branch object storage and functions. Dedicated tenancy only.",
    commands: ["neon"],
    source: "skills/workser/reference/neon-backend.md",
    body: `# The project's own database

The project's database, run the way an operator runs one: branches (copies of
the data), the databases on them, and the compute that serves them. Plus
S3-compatible object storage and Node.js HTTP functions on the same branch.

\`\`\`
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
\`\`\`

## Check \`neon status\` first — always

Three things must all be true: **dedicated tenancy**, the capability **switched on**,
and a **supported region**.

Region is fixed when the project is created. \`regionSupportsNeonBackend: false\` is
**final, not retryable** — no amount of waiting or retrying changes it. When you see
it, say so plainly and fall back to \`workser storage\` (the default bucket).

## Branches are the useful one

A branch is a **full copy of the data**, made in about a second, costing almost
nothing until something writes to it. That is what lets a check run against real
data without being able to damage it — give a QA step its own branch instead of
pointing it at the live database.

Two things cannot happen at all, whatever anyone approves: **the branch the app
runs on cannot be deleted or reset**, and neither can **the database it connects
to**. Those refusals come from the server, not from the approval prompt. If you
meant to reset a copy and got that message, you named the live one.

\`reset\` deletes nothing by name and destroys just as much: it replaces a
branch's contents with its source's. It asks the owner for exactly that reason.

\`--no-compute\` makes a branch with no compute. It is cheaper and **nothing can
connect to it** — useful as a snapshot, useless as somewhere to run tests.

## Notes that matter

- **\`neon storage rm <bucket>\` deletes the bucket and everything in it.** Not
  reversible. Confirm with the user first.
- **\`neon storage url\`** issues a short-lived URL — prefer it to moving large files
  through Workser.
- **Functions deploy from a zip.** Build the bundle first, then
  \`workser neon functions deploy <slug> <zip>\`.
- **\`neon endpoints\` is the cost question.** \`active\` means it is billing;
  \`idle\` means it is not. It is the only place in the product that answers "what
  is this database costing me while nothing is happening".
- **Most apps never need the storage or functions half.** If the user just wants
  to store uploads, the default bucket in \`reference/storage.md\` is the answer.
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
    title: "Decisions and requirements",
    summary: "Read what this project already decided, and record what a future maintainer will need. Phased work itself is subtasks, not board cards — see `workser help tasks`.",
    commands: ["board","decision","requirement"],
    source: "skills/workser/reference/sdlc-entities.md",
    body: `# Decisions and requirements

These are the project's memory across sessions. They write to the **same tables**
the Orbit desktop's Project Memory panel uses, so anything here appears there too
— and, inside an Orbit-spawned run, as an inline card in the conversation.
Documents have their own guide: \`workser help docs\`. Phased work is tracked as
subtasks, not here — see \`workser help tasks\`.

> **The Board (\`workser board ...\`) is deprecated for agent use.** It used to be
> where a multi-phase plan went, one card per phase — and the phase was ALSO a
> subtask the planning turn had just filed for the same piece of work. That gave
> a task two competing plans, one of which this task's own page never reads and
> nothing kept in sync with the other. Phases are \`project_tasks\` subtasks now,
> full stop: \`workser task subtask add\`. Do not run \`workser board create\` for
> planned work — see \`workser help tasks\`.

\`\`\`
workser decision list [--limit <n>]
workser decision show <id>
workser decision create <title> --context <text> --decision <text>
                                 [--consequences <text>]

workser requirement list [--status <value>] [--limit <n>]
workser requirement show <id>
workser requirement create <title> --body <text> [--status <text>]
workser requirement update <id> [--title <text>] [--body <text>] [--status <text>]

\`\`\`

## Read first — this is the part that matters

Before starting anything beyond a trivial edit:

\`\`\`
workser decision list --json       # what was already decided (don't reverse it)
\`\`\`

The project outlives your session. A decision recorded three weeks ago is the
only thing standing between you and quietly undoing a choice someone made on
purpose — \`workser decision show <id>\` gives you the context and consequences,
not just the title. Reach for \`workser doc list\` / \`workser requirement list\`
the same way when the task touches documented behaviour.

## Work with phases → subtasks + a plan doc, before you build

The moment you split a task into more than one phase, file it — not afterwards,
and not only in your reply, which is gone once the conversation scrolls.

\`\`\`bash
# the phases themselves — this task's own subtask list, not the Board
workser task subtask add "Phase 1 — schema + migration" --role api \\
  --note "Add orders/line_items tables and the migration."
workser task subtask add "Phase 2 — checkout API" --role api --note "…"

# the plan's narrative, ONE doc, deliberately NOT linked to a subtask
workser doc create "Checkout — implementation plan" --markdown "$(cat plan.md)" --json

# the approach, if the plan settled something with real alternatives
workser decision create "Carts live server-side" --context "…" --decision "…" --json
\`\`\`

**A wrong row is edited, not replaced.** If a subtask's title, teammate, note or
scope is wrong after you created it, fix that same row:

\`\`\`bash
workser task subtask update <id> --title "…" --role api --note "…" --scope "src/api"
\`\`\`

Never tell the user a subtask is locked, and never file a second one alongside
the wrong one — a plan with a duplicate phase in it is a plan nobody can read
the progress of.

**Don't pass \`--work-item\` for a multi-phase plan.** A linked document renders on
its card and is *hidden* from the Docs panel; a plan spanning three phases
belongs to the project, not to phase 1.

The bar: if the user closed this conversation now, the subtask list should still
show what's left and the doc should still explain the plan to whoever continues
it.

## Decisions are append-only

\`decision create\` is for something with real tradeoffs worth a paper trail:
\`--context\` is why it came up, \`--decision\` what was decided, \`--consequences\`
the follow-on effects. There is deliberately **no \`decision update\`** — a record
states what was decided at a point in time. When it stops being right, record a
new decision that supersedes it and say so in its \`--context\`. Editing the
history is how a decision log stops being worth reading.

Requirements legitimately move along, so they do have \`update\`.

\`\`\`
workser requirement create "Support SSO" --body "Enterprise customers need SAML." \\
  --status proposed
workser requirement update <id> --status done
\`\`\`

## Docs

\`--markdown\` is the normal way to write one. The body is stored both as the
rich text the Docs panel renders and as a git-tracked mirror at
\`.workser/docs/<id>.md\`; \`workser doc show <id> --markdown\` reports that path so
you can read the file with your normal tools.

Revise trd saying "fix the bug" is not fixing the bug.
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
    topic: "tasks",
    title: "Project tasks & subtasks",
    summary: "The ticket you are working inside: read it, break it into steps, and ask before starting.",
    commands: ["task"],
    source: "skills/workser/reference/tasks.md",
    body: `# Project tasks & subtasks

A **project task** is a ticket the owner filed. You are usually running inside
one — Orbit sets \`WORKSER_PROJECT_TASK_ID\` on your process, so every command
below defaults to it and you rarely pass an id at all.

\`\`\`
workser task list [--status <value>] [--label <value>] [--limit <n>]
workser task show [id]                  # the task you are in, with its steps
workser task create <title> [--note <text>] [--kind <value>]
                           [--label <value...>] [--app <id...>]
                           [--infra <ref...>]

workser task subtask add <title> [--role <value>] [--kind <value>]
                                 [--note <text>] [--app <id...>]
                                 [--infra <ref...>] [--scope <path...>]
                                 [--depends-on <key...>]
workser task subtask list [taskId]
workser task subtask update <id> [--title|--note|--role|--kind|--scope]
workser task subtask remove <id>
workser task subtask send-back <id> --note <text>   # redo it, and say why

workser task can-start [id]             # may work begin? refuses until approved
workser task approval request           # tell the owner the plan is ready
workser task move <id> <status>
workser task done [id] --summary <text>
\`\`\`

## This is not \`workser board\`

\`board\` is the Orbit Board — a human's list of work items. \`task\` is the AI Tech
Team's own table. Filing your plan on the Board puts it somewhere the owner's
task page never reads: they see "created work item" and an empty plan. Use
\`task subtask add\`.

## Opening work from a project channel

When a project-channel conversation produces actionable work, the PM may record
it with \`workser task create\`. Orbit supplies the channel and source-message IDs;
the command records them and posts the new task card as a Project Manager message
automatically. Do not invent or ask for those IDs.

Opening a task does **not** approve it or start implementation. The task remains
awaiting the owner. Never approve or dispatch a task you opened yourself.

## Planning a task

Read the project first, then propose. One \`subtask add\` per step:

\`\`\`
workser task subtask add "Build the upload endpoint" \\
  --role api --kind service \\
  --note "Accept a file, work out its type, hand it to the right analyzer." \\
  --scope src/app/api/analyze/route.ts

workser task subtask add "Check every supported file type end to end" \\
  --role qa --depends-on RIZZ-15
\`\`\`

\`--role\` is one of: pm, architect, web, api, automation, qa.
\`--kind\` is what the step produces: data_reports, web, mobile, service,
automation, docs. It is not the same fact as the role — the same engineer
writing a screen, the docs for it and the service behind it is three kinds of
work.

\`--scope\` is what that step OWNS. Two steps naming the same file cannot run at
the same time, so keeping scopes apart is what lets the team work in parallel.
\`--depends-on\` takes the keys you read off \`task show\`.

Between three and six steps. If it needs more, say the task is too big instead.
The step that CHECKS work must not be the same role as the one that built it.

## Nothing runs until the owner approves

\`\`\`
workser task can-start
\`\`\`

This exits non-zero, with the reason, until they have approved the plan — that
refusal is the product working, not an error to route around. Ask with
\`workser task approval request\`; only a person can answer.

## Finishing a step

\`\`\`
workser task done --summary "The report now shows cost per KOL, with six months of history."
\`\`\`

Write the summary for someone who runs a business and does not read code.

## Sending a step back

A step that finished but is not good enough is **sent back**, not replaced:

\`\`\`
workser task subtask send-back 3f2a… --note "The totals ignore refunds."
\`\`\`

That puts it in the queue again as a **second attempt** on the same step. Two
reasons it matters that this is not a new step:

- The owner's screen can then say *"1 send-back, fixed — 2nd run passed"*. A
  replacement step says only that two steps exist, which tells them nothing
  about whether their team caught its own mistake.
- \`--note\` is the reason, and it is recorded against the attempt being
  rejected. Without it the history can say a step ran twice but not why.

It refuses a step that is still working. Let it finish first — the run is
still writing to it.
`,
  },
  {
    topic: "usage",
    title: "Usage — what is being used, against the plan",
    summary: "How much database, file storage, projects and apps are in use, and how close that is to what the plan allows.",
    commands: ["usage"],
    source: "skills/workser/reference/usage.md",
    body: `# Usage — what is being used, against the plan

\`\`\`
workser usage        # storage, projects, apps — and how close each is to the limit
\`\`\`

Run it before you propose anything that adds to a count. "Create another
project" is a plan you can only sensibly make if you know the plan allows two
and two already exist.

## Two scopes in one answer, on purpose

* **Database and files are ORGANISATION-wide.** One pool across every project.
  There is no per-project storage limit, and reporting one would invent it.
* **Projects, and apps in this project, are counted where they apply.** These
  are the limits people actually hit.

## Two kinds of limit, which do not mean the same thing

* **Hard cap** — projects, apps. Going over is **refused**. \`workser usage\`
  exits non-zero when one is reached, so a step can gate on it.
* **Soft allowance** — database, files. Going over is **billed as extra**,
  never blocked. It does not fail the command, because a customer growing past
  their allowance should not have their automation start breaking that day.

## "not measured" is not zero

A figure that could not be read prints as \`not measured\`, with the reason, and
draws no bar. Do not report it as \`0\`, and do not tell the user they have room
based on it — nobody looked.

If a scan comes back with a figure missing, say which one and why. "Your
database is using 2.5 GB of 10; the file total could not be read" is a useful
sentence. "You are using 2.5 GB of 20" is not, and it is wrong.

## What to do with it

- Near a **soft** limit: tell the owner what the extra will cost them, and what
  is taking the space. Do not delete anything to make a number look better.
- At a **hard** cap: say which plan raises it. Do not attempt the create — it
  will be refused, and a failed attempt reads to the owner as a broken product.
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
