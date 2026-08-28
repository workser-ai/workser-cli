import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject, type Context } from "../context.js";
import { ok, line, warn } from "../output.js";
import { WorkserError } from "../errors.js";
import { assertDelegatableModel } from "../model-policy.js";
import type { Goal } from "./goal.js";

/**
 * `workser task` — the AI Tech Team's project tasks and their subtasks.
 *
 * THIS IS NOT `workser board`. That one is the Orbit Board (`work_items`), a
 * human's list of things to do. This is `project_tasks`: a ticket that an AI
 * manager plans, breaks into subtasks, and gets approval for before anything
 * runs. They are different tables with different lifecycles, and a manager that
 * filed its plan on the Board put it somewhere the task page never reads — the
 * owner saw "Created work item" in the log and an empty plan in the panel.
 *
 * SUBTASKS ARE THE POINT. Before this command existed, the manager proposed its
 * plan as a fenced ```subtasks block that the desktop parsed and turned into
 * rows. That worked, but it made the desktop the only client that could ever
 * create a plan, and it meant a manager could not add ONE step later without
 * re-emitting the whole block. `subtask add` writes the row directly, so the
 * plan is built the same way whoever is building it.
 *
 * THE GATE IS NOT NEGOTIABLE. `dispatch-check` returns 409 until the owner has
 * approved, and this command relays that verbatim — an agent that wants to
 * start a subtask has to ask, and being told no is the expected outcome, not an
 * error to work around. `approval request` exists so the manager can say it is
 * ready; only a person can answer.
 *
 * Literal status/role values are mirrored from the desktop's
 * `project-tasks.ts` rather than imported — this CLI has no build-time
 * dependency on the app's source (same reasoning `board.ts` gives). If those
 * lists change, update both places.
 */
const STATUSES = [
  "todo",
  "working",
  "checking",
  "ready",
  "accepted",
  "archived",
] as const;

/**
 * The roles the dispatcher can actually run.
 *
 * THIS LIST WAS SIX NAMES LONG AND THE DISPATCHER HAS THIRTEEN. `--role mobile`
 * and `--role python` — two of the app types this product is built around —
 * were refused at the keyboard, so a manager planning a phone app had to file
 * its steps as `web` and a data script as `api`. The work still ran; it ran as
 * the wrong teammate, with the wrong briefing and the wrong permissions, and
 * nothing on screen said so.
 *
 * Kept in the same order as core-api's `TASK_ROLES`, which is the list the API
 * validates against — a name here that is not there is a 400 nobody can read,
 * and a name there that is missing here is this bug again.
 */
const ROLES = [
  "pm",
  "architect",
  "designer",
  "web",
  "api",
  "mobile",
  "python",
  "automation",
  "qa",
  "devops",
  "sre",
  "security",
  "analyst",
] as const;

/**
 * WHO A STEP RUNS ON, when the manager overrides the configured team.
 *
 * The step row has carried `agent_override` / `agent_model_override` /
 * `agent_effort_override` since the runner learned to honour them, and nothing
 * but the desktop's picker could ever set one — so the manager, the only party
 * that knows what each step actually is, could choose a teammate and not the
 * engine that teammate runs on. These flags are that half of the decision.
 *
 * The list is what the daemon can dispatch. It is validated here so a typo
 * fails at the keyboard with the reason, rather than at dispatch time as a CLI
 * that does not exist.
 */
const AGENTS = [
  "claude_code",
  "codex",
  "workser_code",
  "opencode",
  "cursor",
  "gemini",
] as const;

/**
 * Effort levels every agent that takes one accepts.
 *
 * `ultra` is Codex-only and deliberately absent: a level one CLI rejects is a
 * failed turn mid-run, and this list is shared across all of them.
 */
const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

/** What a step produces, in the board's own vocabulary. */
/**
 * What a step produces, in the board's own vocabulary.
 *
 * Six, and deliberately fewer than the app types: a `worker`, a `cron` job and
 * an `ai-agent` app are all `service` or `automation` work here, and the step's
 * `--app` already says which app it is for and therefore what it really is.
 * The mapping is spelled out in the flag's help below, because a manager
 * guessing at it files the same kind of work under two names on two days.
 */
const KINDS = [
  "data_reports",
  "web",
  "mobile",
  "service",
  "automation",
  "docs",
] as const;

/** Which kind an app of each type takes, said once so both flags can say it. */
const KIND_HELP =
  "what it produces (web app → web · phone app → mobile · api or ai-agent → service · worker or scheduled job → automation · report or analysis → data_reports · written page → docs)";

interface TaskTarget {
  kind: string;
  appId: string | null;
  appName: string | null;
  ref: string | null;
  isPrimary: boolean;
}

interface ProjectTask {
  id: string;
  key: string | null;
  parent_task_id: string | null;
  title: string;
  summary: string | null;
  category: string | null;
  role: string | null;
  status: string;
  approval_state: string;
  scope_paths: string[];
  depends_on: string[];
  labels: string[];
  agent_type: string | null;
  agent_model: string | null;
  result_summary: string | null;
  targets: TaskTarget[];
  subtaskTotal: number;
  subtaskDone: number;
}

interface TaskDetail extends ProjectTask {
  subtasks: ProjectTask[];
}

export function registerTask(program: Command): void {
  const task = program
    .command("task")
    .description("The project's tasks and their subtasks (AI Tech Team)");

  task
    .command("list")
    .description("List the board's tasks — run this before starting anything")
    .option(
      "--status <value>",
      `only tasks in this status (${STATUSES.join(" | ")})`,
    )
    .option("--label <value>", "only tasks carrying this label")
    .option("--limit <n>", "cap the number of tasks returned")
    .action(
      action(async ({ ctx, opts }) => {
        requireProject(ctx);
        if (opts.status !== undefined)
          assertOneOf("--status", opts.status, STATUSES);
        const rows =
          (await api<ProjectTask[]>(ctx, "/v1/project-tasks", {
            query: {
              status: opts.status,
              label: opts.label,
              limit: opts.limit,
            },
          })) ?? [];
        ok(rows, () => {
          if (!rows.length) {
            line(pc.dim("No tasks on the board yet."));
            return;
          }
          for (const r of rows) line(formatRow(r));
        });
      }),
    );

  task
    .command("show [id]")
    .description(
      "Show a task with its subtasks, what each one did, and what they produced. " +
        "Defaults to the plan this run is part of.",
    )
    .action(
      action(async ({ ctx, args }) => {
        // THE PLAN, not the caller's own row. Inside a dispatched step
        // `projectTaskId` is that step; the thing worth showing — and the
        // thing this command's own description promises — is the task it
        // belongs to, with every sibling and what each of them produced.
        const id = args[0] || ctx.parentTaskId || resolveTaskId(ctx);
        const row = await api<TaskDetail>(
          ctx,
          `/v1/project-tasks/${encodeURIComponent(id)}`,
        );
        /**
         * THE PLAN THIS TASK SITS INSIDE, when it sits inside one.
         *
         * Fetched here rather than left for the agent to remember to ask for.
         * The teaching says "when a part finishes, say what it means and offer
         * the next one" — which was unusable advice, because nothing ever put
         * the state of the other parts in front of the agent at the moment it
         * finished. It had to know to go looking, on a turn where it thought it
         * was done.
         *
         * One extra call, only on tasks that belong to a goal. Failure is
         * silent: the plan is context, and a task must still print without it.
         */
        const goalId = (row as { goal_id?: string | null }).goal_id;
        const goal = goalId
          ? await api<Goal>(
              ctx,
              `/v1/project-goals/${encodeURIComponent(goalId)}`,
            ).catch(() => null)
          : null;
        ok({ ...row, goal }, () => printTask(row, goal));
      }),
    );

  /**
   * Open a ROOT task from a project conversation.
   *
   * A task records work; it does not approve or dispatch it. When Orbit
   * supplies channel origin, keep that provenance server-side and attach the
   * resulting card to the source message so the decision and the work stay one
   * click apart.
   */
  task
    .command("create <title>")
    .description("Open a new root task for the project team")
    .option("--note <text>", "context, constraints and expected outcome")
    .option("--kind <value>", KIND_HELP)
    .option("--label <value...>", "labels to put on the task")
    .option("--app <id...>", "apps the task touches")
    .option("--infra <ref...>", "shared setup it touches")
    .option("--goal <id>", "the business goal this delivers part of")
    .option(
      "--phase <name>",
      "which slice of that goal — must match one of its phase names",
    )
    .action(
      action(async ({ ctx, args, opts }) => {
        requireProject(ctx);
        if (opts.kind !== undefined) assertOneOf("--kind", opts.kind, KINDS);

        const hasChannelOrigin = Boolean(
          ctx.projectChannelId && ctx.projectChannelMessageId,
        );
        const row = await api<ProjectTask>(ctx, "/v1/project-tasks", {
          body: {
            title: args[0],
            summary: opts.note,
            category: opts.kind,
            labels: opts.label,
            // The level above this task, when it has one. Most tasks do not —
            // a goal has to be argued for, never assumed.
            goalId: opts.goal,
            phase: opts.phase,
            targets: [
              ...(opts.app ?? []).map((appId: string) => ({
                kind: "app",
                appId,
              })),
              ...(opts.infra ?? []).map((ref: string) => ({
                kind: "infra",
                ref,
              })),
            ],
            ...(hasChannelOrigin
              ? {
                  channelId: ctx.projectChannelId,
                  createdFromMessageId: ctx.projectChannelMessageId,
                  createdByKind: "agent",
                }
              : {}),
          },
        });

        let channelMessage: unknown;
        let channelMessageError: { code: string; message: string } | undefined;
        if (
          hasChannelOrigin &&
          ctx.projectChannelId &&
          ctx.projectChannelMessageId
        ) {
          try {
            channelMessage = await api(
              ctx,
              `/v1/project-channels/${encodeURIComponent(ctx.projectChannelId)}` +
                "/messages",
              {
                body: {
                  content: "",
                  agentRole: ctx.agentRole ?? "pm",
                  agentType: ctx.agentType ?? "workser",
                  agentModel: ctx.agentModel ?? "Agent default",
                  attachments: [{ resourceType: "task", resourceId: row.id }],
                },
              },
            );
          } catch (error) {
            // The task already exists. A failing exit would invite a retry and
            // create a duplicate, so keep success and make the card failure
            // explicit in both JSON and human output.
            const failure =
              error instanceof WorkserError
                ? error
                : new WorkserError(String(error));
            channelMessageError = {
              code: failure.code,
              message: failure.message,
            };
          }
        }

        const result = {
          ...row,
          ...(channelMessage ? { channelMessage } : {}),
          ...(channelMessageError ? { channelMessageError } : {}),
        };
        ok(result, () => {
          line(
            `${pc.green("opened")} ${pc.bold(row.title)}  ${pc.dim(row.key ?? row.id)}`,
          );
          if (channelMessage)
            line(pc.dim("posted to the channel as Project Manager"));
          if (channelMessageError) {
            warn(
              `Task opened, but its Project Manager card could not be posted: ${channelMessageError.message}`,
            );
          }
        });
      }),
    );

  /**
   * The command this whole surface exists for.
   *
   * `--depends-on` takes the SUBTASK KEYS or ids of steps that must finish
   * first, and `--scope` the files this step owns. Both matter for the same
   * reason: two steps that claim the same file cannot run at the same time, so
   * the dispatcher needs to know what each one touches before it can run any of
   * them in parallel. Asking for it after the fact means asking twice.
   */
  const subtask = task
    .command("subtask")
    .description("The subtasks a task is broken into");

  subtask
    .command("add <title>")
    .description(
      'Add one subtask, e.g. `workser task subtask add "Build the upload screen" --role web`',
    )
    .option(
      "--task <id>",
      "the parent task (defaults to the task this run is inside)",
    )
    .option("--role <value>", `who does it (${ROLES.join(" | ")})`)
    .option("--kind <value>", KIND_HELP)
    .option("--note <text>", "one sentence on what this subtask does")
    .option(
      "--app <id...>",
      "the app this subtask is for — one id runs it inside that app's folder; leave it off and it runs at the project, seeing every app",
    )
    .option(
      "--infra <ref...>",
      "shared setup it touches (database | storage | auth | hosting | jobs)",
    )
    .option("--scope <path...>", "files or folders THIS subtask owns")
    .option(
      "--depends-on <id...>",
      "subtasks that must finish first (key or id)",
    )
    .option(
      "--agent <id>",
      `run this step on a specific CLI (${AGENTS.join(" | ")}) instead of the role's own`,
    )
    .option("--model <id>", "the model that CLI should use for this step")
    .option("--effort <level>", `how hard it thinks (${EFFORTS.join(" | ")})`)
    .action(
      action(async ({ ctx, args, opts }) => {
        const parent = resolveTaskId(ctx, opts.task);
        if (opts.role !== undefined) assertOneOf("--role", opts.role, ROLES);
        if (opts.kind !== undefined) assertOneOf("--kind", opts.kind, KINDS);
        if (opts.agent !== undefined) assertOneOf("--agent", opts.agent, AGENTS);
        if (opts.effort !== undefined)
          assertOneOf("--effort", opts.effort, EFFORTS);
        // The price gate — see `model-policy.ts`. Refused here, where whoever
        // asked can still choose again, rather than at dispatch as a failed run.
        assertDelegatableModel("--model", opts.model);

        // Dependencies are given as keys because that is what an agent has read
        // off `task show`; the API wants ids. Resolved here rather than pushed
        // onto the caller, which would mean every agent writing the same lookup.
        const dependsOn = await resolveDeps(ctx, parent, opts.dependsOn ?? []);

        const row = await api<ProjectTask>(ctx, "/v1/project-tasks", {
          body: {
            parentTaskId: parent,
            title: args[0],
            summary: opts.note,
            role: opts.role,
            category: opts.kind,
            scopePaths: opts.scope,
            dependsOn,
            targets: [
              ...(opts.app ?? []).map((appId: string) => ({
                kind: "app",
                appId,
              })),
              ...(opts.infra ?? []).map((ref: string) => ({
                kind: "infra",
                ref,
              })),
            ],
          },
        });
        /**
         * A SECOND CALL, and it has to be: create takes the plan, and the
         * runner overrides live on the update contract (a step's engine is a
         * decision ABOUT the step, changeable right up until it starts). Only
         * made when something was actually asked for, so the common case is
         * still one request.
         */
        const runner =
          opts.agent !== undefined ||
          opts.model !== undefined ||
          opts.effort !== undefined
            ? await api<ProjectTask>(
                ctx,
                `/v1/project-tasks/${encodeURIComponent(row.id)}`,
                {
                  method: "PATCH",
                  body: {
                    agentOverride: opts.agent,
                    agentModelOverride: opts.model,
                    agentEffortOverride: opts.effort,
                  },
                },
              )
            : null;

        ok(runner ?? row, () => {
          line(
            `${pc.green("added")} ${pc.bold(row.title)}  ${pc.dim(row.key ?? row.id)}`,
          );
          if (row.role) line(pc.dim(`role: ${row.role}`));
          if (runner) {
            line(
              pc.dim(
                `runs on: ${[opts.agent, opts.model, opts.effort]
                  .filter(Boolean)
                  .join(" · ")}`,
              ),
            );
          }
        });
      }),
    );

  subtask
    .command("list [taskId]")
    .description("The subtasks of a task, in order")
    .action(
      action(async ({ ctx, args }) => {
        const id = resolveTaskId(ctx, args[0]);
        const row = await api<TaskDetail>(
          ctx,
          `/v1/project-tasks/${encodeURIComponent(id)}`,
        );
        const rows = row.subtasks ?? [];
        ok(rows, () => {
          if (!rows.length) {
            line(pc.dim("No subtasks yet."));
            return;
          }
          rows.forEach((r, i) => line(formatSubtask(r, i + 1)));
        });
      }),
    );

  subtask
    .command("update <id>")
    .description("Change a subtask — its title, its role, what it touches")
    .option("--title <text>")
    .option("--note <text>")
    .option("--role <value>", ROLES.join(" | "))
    .option("--kind <value>", KINDS.join(" | "))
    .option("--scope <path...>", "replaces the subtask's scope entirely")
    .option(
      "--agent <id>",
      `run this step on a specific CLI (${AGENTS.join(" | ")}); "default" hands it back to the role's own`,
    )
    .option("--model <id>", 'the model that CLI should use; "default" clears it')
    .option(
      "--effort <level>",
      `how hard it thinks (${EFFORTS.join(" | ")}); "default" clears it`,
    )
    .action(
      action(async ({ ctx, args, opts }) => {
        if (opts.role !== undefined) assertOneOf("--role", opts.role, ROLES);
        if (opts.kind !== undefined) assertOneOf("--kind", opts.kind, KINDS);
        // `default` is the word for "stop overriding", and it sends `null` —
        // which is what the API reads as "hand this back to the role". Without
        // it an override could be set and never taken off from here.
        if (opts.agent !== undefined && opts.agent !== "default")
          assertOneOf("--agent", opts.agent, AGENTS);
        if (opts.effort !== undefined && opts.effort !== "default")
          assertOneOf("--effort", opts.effort, EFFORTS);
        // `default` clears the override and is never a model name, so it is
        // safe to check the same way the other flags are.
        if (opts.model !== "default")
          assertDelegatableModel("--model", opts.model);
        const clearable = (value?: string) =>
          value === undefined ? undefined : value === "default" ? null : value;
        const row = await api<ProjectTask>(
          ctx,
          `/v1/project-tasks/${encodeURIComponent(args[0])}`,
          {
            method: "PATCH",
            body: {
              title: opts.title,
              summary: opts.note,
              role: opts.role,
              category: opts.kind,
              scopePaths: opts.scope,
              agentOverride: clearable(opts.agent),
              agentModelOverride: clearable(opts.model),
              agentEffortOverride: clearable(opts.effort),
            },
          },
        );
        ok(row, () => line(`${pc.green("updated")} ${pc.bold(row.title)}`));
      }),
    );

  subtask
    .command("remove <id>")
    .description("Remove a subtask (only before the work starts)")
    .action(
      action(async ({ ctx, args }) => {
        await api(ctx, `/v1/project-tasks/${encodeURIComponent(args[0])}`, {
          method: "DELETE",
        });
        ok({ removed: args[0] }, () => line(pc.green("removed")));
      }),
    );

  task
    .command("move <id> <status>")
    .description(
      `Move a task or step along the board (${STATUSES.join(" | ")})`,
    )
    .action(
      action(async ({ ctx, args }) => {
        assertOneOf("<status>", args[1], STATUSES);
        const row = await api<ProjectTask>(
          ctx,
          `/v1/project-tasks/${encodeURIComponent(args[0])}/move`,
          { body: { status: args[1] } },
        );
        ok(row, () =>
          line(`${pc.green("moved")} ${pc.bold(row.title)} → ${args[1]}`),
        );
      }),
    );

  /**
   * Send a step back to be done again.
   *
   * THE MANAGER'S VERB, and the only way a second attempt ever happens. The
   * runner will not touch a step whose status is not `todo`, so a step judged
   * insufficient stays finished for ever unless something reopens it — which
   * is why "1 send-back, fixed" was, until this existed, a sentence the
   * product could not produce.
   *
   * The note is not decoration. It closes the rejected attempt as
   * `changes_requested` carrying the reason, which is what lets the history
   * say WHY a step ran twice instead of just that it did.
   */
  /**
   * RESUME A STEP THE OWNER STOPPED.
   *
   * Distinct from `send-back`, and the distinction is the whole point.
   * `send-back` is for a step that FINISHED badly: it has an attempt to close
   * and a reason to record. This is for one that never got to finish because a
   * person pressed Stop — its row is already back at `todo`, so `send-back`
   * refuses it as `already_open` and nothing moves.
   *
   * What actually holds a stopped step is a record on the owner's machine, and
   * until this existed nothing an agent could run could clear it. So a manager
   * asked to carry on could only report, over and over, that it could not:
   * every remaining step blocked behind one it had no verb to release.
   *
   * A STOP IS THE OWNER'S DECISION. Resume it when they ask you to carry on —
   * not because the plan is blocked and you would like it not to be.
   */
  task
    .command("resume [id]")
    .description(
      "Put a task the owner stopped back in the queue — only when they ask you to carry on",
    )
    .action(
      action(async ({ ctx, args }) => {
        const id = resolveTaskId(ctx, args[0]);
        const row = await api<{ queued?: boolean; started?: number | null }>(
          ctx,
          `/v1/project-tasks/${encodeURIComponent(id)}/retry`,
          { method: "POST" },
        );
        /**
         * SAY WHAT HAPPENED, not what might.
         *
         * This used to print "it is back in the queue and will start on the
         * next dispatch" every time — a promise about a future event, made
         * without knowing whether anything would ever cause it. When nothing
         * did, an agent read that line, believed the work was moving, and
         * reported to the owner that it was. The daemon now starts the work
         * itself and reports how many steps actually began, so the three
         * outcomes can be told apart instead of collapsed into a hopeful one.
         */
        ok(row, () => {
          if (!row?.queued) {
            line(pc.yellow("could not resume it — check the step id"));
            return;
          }
          const started = row.started ?? 0;
          if (started > 0) {
            line(
              `${pc.green("resumed")} — ${started} step${started === 1 ? "" : "s"} started`,
            );
            return;
          }
          // Queued, nothing started. Usually the approval gate, sometimes
          // every remaining step waiting on one still running. Both are real
          // states and neither is "it will start soon".
          line(
            `${pc.green("resumed")} — it is queued, but nothing started yet. Check the plan is approved and that no step is blocking the rest.`,
          );
        });
      }),
    );

  subtask
    .command("send-back <id>")
    .description("Send a finished step back to be done again, with the reason")
    .requiredOption("--note <text>", "what was wrong with it")
    .action(
      action(async ({ ctx, args, opts }) => {
        const row = await api<{ reopened?: boolean; reason?: string }>(
          ctx,
          `/v1/project-subtasks/${encodeURIComponent(String(args[0]))}/reopen`,
          { method: "POST", body: { note: opts.note } },
        );
        ok(row, () => {
          if (row?.reopened) {
            line(`${pc.green("sent back")} — it will be picked up again`);
            return;
          }
          // Every refusal names itself. "Nothing happened" and "it is already
          // waiting to run" look identical from the outside otherwise.
          line(
            pc.yellow(
              row?.reason === "already_open"
                ? "already waiting to be picked up — nothing to send back"
                : row?.reason === "still_working"
                  ? "still working — let it finish before sending it back"
                  : "could not send that step back",
            ),
          );
        });
      }),
    );

  /**
   * Ask whether this step may start.
   *
   * The 409 is the product, not an error to route around: nothing a manager
   * proposes runs until a person has approved the plan. This prints the refusal
   * in the same words the owner would see and exits non-zero, so a shell
   * `&&` chain stops rather than plowing on.
   */
  task
    .command("can-start [id]")
    .description(
      "Ask whether work on this task may begin. Refuses until the owner approves.",
    )
    .action(
      action(async ({ ctx, args }) => {
        const id = resolveTaskId(ctx, args[0]);
        const row = await api<{ ok?: boolean }>(
          ctx,
          `/v1/project-tasks/${encodeURIComponent(id)}/dispatch-check`,
          { method: "POST" },
        );
        ok(row, () => line(pc.green("approved — you may start")));
      }),
    );

  /**
   * START THE WORK — the verb that was missing.
   *
   * Filing a plan and having it approved used to leave a manager with nothing
   * to do but ask the owner to press a button on a screen they were not
   * looking at. This is the button.
   *
   * It does NOT skip approval — the daemon asks the same gate `can-start`
   * asks, and starts nothing on a plan the owner has not approved. Run it
   * after approval, and again whenever a step finishes and the next one
   * should pick up.
   */
  task
    .command("start [id]")
    .description(
      "Start the steps this task is ready to run — only works once the owner has approved the plan",
    )
    .action(
      action(async ({ ctx, args }) => {
        const id = resolveTaskId(ctx, args[0]);
        const row = await api<{
          started?: number | null;
          note?: string | null;
        }>(ctx, `/v1/project-tasks/${encodeURIComponent(id)}/start`, {
          method: "POST",
        });
        ok(row, () => {
          const started = row?.started ?? null;
          if (started && started > 0) {
            line(
              pc.green(
                `started ${started} step${started === 1 ? "" : "s"} — they are running now`,
              ),
            );
            return;
          }
          // Never "started" when nothing was. The whole reason this verb
          // exists is that a hopeful message got believed and repeated to the
          // owner as fact.
          line(pc.yellow(row?.note ?? "Nothing started."));
        });
      }),
    );

  task
    .command("approval")
    .description("Ask the owner to approve the plan, or record their decision")
    .argument("<request|approve|decline>")
    .option("--task <id>", "defaults to the task this run is inside")
    .option("--note <text>", "why")
    .action(
      action(async ({ ctx, args, opts }) => {
        const id = resolveTaskId(ctx, opts.task);
        const what = args[0];

        // An agent CANNOT approve its own plan. `request` is the only verb it
        // should ever reach for; the other two exist because this CLI is also
        // how a person automates their own decisions, and refusing them here
        // would just mean writing curl by hand.
        if (what === "request") {
          const row = await api<TaskDetail>(
            ctx,
            `/v1/project-tasks/${encodeURIComponent(id)}`,
          );
          ok({ awaiting: row.approval_state === "awaiting", task: row }, () => {
            line(
              row.approval_state === "awaiting"
                ? pc.yellow(
                    "The plan is waiting on the owner. They see it in the task.",
                  )
                : `Already ${row.approval_state}.`,
            );
          });
          return;
        }

        if (what !== "approve" && what !== "decline") {
          throw new WorkserError(
            `Expected "request", "approve" or "decline", got "${what}".`,
            { code: "bad_request" },
          );
        }
        const row = await api<ProjectTask>(
          ctx,
          `/v1/project-tasks/${encodeURIComponent(id)}/approval`,
          {
            body: {
              decision: what === "approve" ? "approved" : "declined",
              note: opts.note,
            },
          },
        );
        ok(row, () =>
          line(`${pc.green(row.approval_state)} ${pc.bold(row.title)}`),
        );
      }),
    );

  task
    .command("done [id]")
    .description("Record what a subtask produced, and move it to ready")
    .option("--summary <text>", "what changed, in the owner's words")
    .action(
      action(async ({ ctx, args, opts }) => {
        const id = resolveTaskId(ctx, args[0]);
        await api(ctx, `/v1/project-tasks/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: { resultSummary: opts.summary },
        });
        const row = await api<ProjectTask>(
          ctx,
          `/v1/project-tasks/${encodeURIComponent(id)}/move`,
          { body: { status: "ready" } },
        );
        ok(row, () => line(`${pc.green("ready")} ${pc.bold(row.title)}`));
      }),
    );
}

/* ------------------------------------------------------------------ helpers */

/**
 * Which task a command is about.
 *
 * The env var is the normal path: Orbit sets it on the agent it spawns, so a
 * manager never has to be told which task it is inside. `--task` covers the
 * hand-run case, and the error names both rather than only the flag — an agent
 * reading "pass --task" would pass a uuid it invented.
 */
function resolveTaskId(ctx: Context, given?: string): string {
  const id = given || ctx.projectTaskId;
  if (!id) {
    throw new WorkserError(
      "No task. This run isn't inside one (WORKSER_PROJECT_TASK_ID is unset), so pass --task <id or key>.",
      { code: "no_task" },
    );
  }
  return id;
}

/** Keys ("RIZZ-14") resolved to ids, since that is what an agent has read. */
async function resolveDeps(
  ctx: Context,
  parentId: string,
  given: string[],
): Promise<string[] | undefined> {
  if (!given.length) return undefined;
  const parent = await api<TaskDetail>(
    ctx,
    `/v1/project-tasks/${encodeURIComponent(parentId)}`,
  );
  const byKey = new Map<string, string>();
  for (const s of parent.subtasks ?? []) {
    byKey.set(s.id, s.id);
    if (s.key) byKey.set(s.key, s.id);
  }
  return given.map((g) => {
    const id = byKey.get(g);
    if (!id) {
      throw new WorkserError(
        `"${g}" is not a subtask of this task. Run \`workser task subtask list\` to see them.`,
        { code: "bad_request" },
      );
    }
    return id;
  });
}

function assertOneOf(
  flag: string,
  value: string,
  allowed: readonly string[],
): void {
  if (!allowed.includes(value)) {
    throw new WorkserError(
      `${flag} must be one of: ${allowed.join(", ")} — got "${value}".`,
      { code: "bad_request" },
    );
  }
}

function formatRow(r: ProjectTask): string {
  const key = pc.dim((r.key ?? r.id.slice(0, 8)).padEnd(10));
  const steps = r.subtaskTotal
    ? pc.dim(` ${r.subtaskDone}/${r.subtaskTotal}`)
    : "";
  const gate =
    r.approval_state === "awaiting" ? pc.yellow(" awaiting approval") : "";
  return `${key} ${statusTag(r.status)} ${r.title}${steps}${gate}`;
}

function formatSubtask(r: ProjectTask, index: number): string {
  const n = pc.dim(String(index).padStart(2, "0"));
  const role = r.role ? pc.dim(` [${r.role}]`) : "";
  const scope = r.scope_paths?.length
    ? pc.dim(`  owns: ${r.scope_paths.join(", ")}`)
    : "";
  const head = `${n} ${statusTag(r.status)} ${r.title}${role}${scope}`;
  /**
   * WHAT IT ACTUALLY DID — the half that was missing.
   *
   * This listing is how every agent on a task learns about its siblings, and
   * it used to print only their titles and statuses. A step could see that the
   * three before it were `[ready]` and had no way at all to find out what they
   * had produced, so each one re-derived context the last one had already
   * established: the reviewer re-read what the engineer built, the deployer
   * guessed at what had been changed. `result_summary` was on the type and
   * never printed.
   *
   * Indented under its step rather than appended, because these are sentences
   * and the line above is a row.
   */
  const summary = (r.result_summary ?? "").trim();
  if (!summary) return head;
  const wrapped = summary
    .split("\n")
    .map((l) => `      ${l}`)
    .join("\n");
  return `${head}\n${pc.dim(wrapped)}`;
}

function printTask(row: TaskDetail, goal?: Goal | null): void {
  line(`${pc.bold(row.title)}  ${pc.dim(row.key ?? row.id)}`);
  line(`${statusTag(row.status)}  approval: ${row.approval_state}`);
  if (row.summary) line(`\n${row.summary}`);
  if (goal) printGoalContext(row, goal);
  if (row.targets?.length) {
    line(
      `\ntouches: ${row.targets.map((t) => t.appName ?? t.ref ?? t.kind).join(", ")}`,
    );
  }
  if (row.subtasks?.length) {
    line(`\n${pc.bold("subtasks")}`);
    row.subtasks.forEach((s, i) => line(formatSubtask(s, i + 1)));
    // Where to go next. The summaries above are what a sibling SAID; the
    // artifacts are what it left behind, and an agent that only ever reads
    // prose about a file is guessing at the file.
    line(
      pc.dim(
        `\nRun \`workser artifact list\` to see what these subtasks produced,`,
      ),
    );
    line(
      pc.dim(
        `or \`workser artifact list --step <id>\` for one subtask's output alone.`,
      ),
    );
  } else {
    line(pc.dim("\nNo subtasks yet."));
  }
}

/**
 * WHERE THIS TASK SITS IN THE PLAN — as a reference, never as a gate.
 *
 * The distinction the whole feature turns on, and the reason this block ends
 * with the sentence it does. Phases do not control anything: a task can be
 * filed under any part, in any order, and work can begin on any part at any
 * time. What they buy is the one thing a task runner cannot say — "that part
 * is finished, this one is sitting there" — and the moment to say it is the
 * moment a part becomes finishable, which is why this prints on every
 * `task show` rather than waiting to be asked for.
 */
function printGoalContext(row: TaskDetail, goal: Goal): void {
  const mine = (row as { phase?: string | null }).phase ?? null;
  line(`\n${pc.bold("part of")}: ${goal.title}`);
  if (goal.outcome) line(pc.dim(`done means: ${goal.outcome}`));

  const progress = goal.progress ?? [];
  for (const p of progress) {
    const where =
      p.total === 0 ? "not started" : `${p.done} of ${p.total} done`;
    const here = mine && p.name === mine ? pc.cyan("  <- this task") : "";
    const mark = p.state === "done" ? pc.green("*") : pc.dim("-");
    line(`  ${mark} ${p.name} — ${where}${here}`);
  }

  // The next part, said plainly, so the offer does not have to be worked out.
  const next = progress.find((p) => p.state !== "done");
  const running = progress.some((p) => p.state === "working");
  if (next && !running) {
    line(
      pc.dim(
        `\nNothing is running. The next part waiting is "${next.name}" — offer ` +
          `it to them in a sentence rather than starting it unasked.`,
      ),
    );
  } else if (!next) {
    line(
      pc.dim(
        "\nEvery part of this plan is done. Say so, and offer to wrap it up.",
      ),
    );
  }
  line(
    pc.dim(
      "The plan is a reference for what was agreed, not a rule about what may " +
        "run. Work can start on any part at any time if they ask for it.",
    ),
  );
}

function statusTag(status: string): string {
  switch (status) {
    case "ready":
      return pc.green("[ready]");
    case "working":
      return pc.blue("[working]");
    case "checking":
      return pc.cyan("[checking]");
    case "accepted":
      return pc.green("[accepted]");
    case "archived":
      return pc.dim("[archived]");
    default:
      return pc.dim("[todo]");
  }
}
