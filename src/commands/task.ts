import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject, type Context } from "../context.js";
import { ok, line } from "../output.js";
import { WorkserError } from "../errors.js";

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
const STATUSES = ["todo", "working", "checking", "ready", "accepted", "archived"] as const;

/** The roles the dispatcher can actually run today. */
const ROLES = ["pm", "architect", "web", "api", "automation", "qa"] as const;

/** What a step produces, in the board's own vocabulary. */
const KINDS = ["data_reports", "web", "mobile", "service", "automation", "docs"] as const;

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
    .option("--status <value>", `only tasks in this status (${STATUSES.join(" | ")})`)
    .option("--label <value>", "only tasks carrying this label")
    .option("--limit <n>", "cap the number of tasks returned")
    .action(
      action(async ({ ctx, opts }) => {
        requireProject(ctx);
        if (opts.status !== undefined) assertOneOf("--status", opts.status, STATUSES);
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
      "Show one task with its subtasks. Defaults to the task this run is inside.",
    )
    .action(
      action(async ({ ctx, args }) => {
        const id = resolveTaskId(ctx, args[0]);
        const row = await api<TaskDetail>(ctx, `/v1/project-tasks/${encodeURIComponent(id)}`);
        ok(row, () => printTask(row));
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
    .description("The steps a task is broken into");

  subtask
    .command("add <title>")
    .description(
      'Add one step, e.g. `workser task subtask add "Build the upload screen" --role web`',
    )
    .option("--task <id>", "the parent task (defaults to the task this run is inside)")
    .option("--role <value>", `who does it (${ROLES.join(" | ")})`)
    .option("--kind <value>", `what it produces (${KINDS.join(" | ")})`)
    .option("--note <text>", "one sentence on what this step does")
    .option("--app <id...>", "app ids this step touches")
    .option("--infra <ref...>", "shared setup it touches (database | storage | auth | hosting | jobs)")
    .option("--scope <path...>", "files or folders THIS step owns")
    .option("--depends-on <id...>", "steps that must finish first (key or id)")
    .action(
      action(async ({ ctx, args, opts }) => {
        const parent = resolveTaskId(ctx, opts.task);
        if (opts.role !== undefined) assertOneOf("--role", opts.role, ROLES);
        if (opts.kind !== undefined) assertOneOf("--kind", opts.kind, KINDS);

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
              ...(opts.app ?? []).map((appId: string) => ({ kind: "app", appId })),
              ...(opts.infra ?? []).map((ref: string) => ({ kind: "infra", ref })),
            ],
          },
        });
        ok(row, () => {
          line(`${pc.green("added")} ${pc.bold(row.title)}  ${pc.dim(row.key ?? row.id)}`);
          if (row.role) line(pc.dim(`role: ${row.role}`));
        });
      }),
    );

  subtask
    .command("list [taskId]")
    .description("The steps of a task, in order")
    .action(
      action(async ({ ctx, args }) => {
        const id = resolveTaskId(ctx, args[0]);
        const row = await api<TaskDetail>(ctx, `/v1/project-tasks/${encodeURIComponent(id)}`);
        const rows = row.subtasks ?? [];
        ok(rows, () => {
          if (!rows.length) {
            line(pc.dim("No steps yet."));
            return;
          }
          rows.forEach((r, i) => line(formatSubtask(r, i + 1)));
        });
      }),
    );

  subtask
    .command("update <id>")
    .description("Change a step — its title, its role, what it touches")
    .option("--title <text>")
    .option("--note <text>")
    .option("--role <value>", ROLES.join(" | "))
    .option("--kind <value>", KINDS.join(" | "))
    .option("--scope <path...>", "replaces the step's scope entirely")
    .action(
      action(async ({ ctx, args, opts }) => {
        if (opts.role !== undefined) assertOneOf("--role", opts.role, ROLES);
        if (opts.kind !== undefined) assertOneOf("--kind", opts.kind, KINDS);
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
            },
          },
        );
        ok(row, () => line(`${pc.green("updated")} ${pc.bold(row.title)}`));
      }),
    );

  subtask
    .command("remove <id>")
    .description("Drop a step from the plan (only before the work starts)")
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
    .description(`Move a task or step along the board (${STATUSES.join(" | ")})`)
    .action(
      action(async ({ ctx, args }) => {
        assertOneOf("<status>", args[1], STATUSES);
        const row = await api<ProjectTask>(
          ctx,
          `/v1/project-tasks/${encodeURIComponent(args[0])}/move`,
          { body: { status: args[1] } },
        );
        ok(row, () => line(`${pc.green("moved")} ${pc.bold(row.title)} → ${args[1]}`));
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
    .description("Ask whether work on this task may begin. Refuses until the owner approves.")
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
                ? pc.yellow("The plan is waiting on the owner. They see it in the task.")
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
        ok(row, () => line(`${pc.green(row.approval_state)} ${pc.bold(row.title)}`));
      }),
    );

  task
    .command("done [id]")
    .description("Record what a step produced, and move it to ready")
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
        `"${g}" is not a step of this task. Run \`workser task subtask list\` to see them.`,
        { code: "bad_request" },
      );
    }
    return id;
  });
}

function assertOneOf(flag: string, value: string, allowed: readonly string[]): void {
  if (!allowed.includes(value)) {
    throw new WorkserError(
      `${flag} must be one of: ${allowed.join(", ")} — got "${value}".`,
      { code: "bad_request" },
    );
  }
}

function formatRow(r: ProjectTask): string {
  const key = pc.dim((r.key ?? r.id.slice(0, 8)).padEnd(10));
  const steps = r.subtaskTotal ? pc.dim(` ${r.subtaskDone}/${r.subtaskTotal}`) : "";
  const gate =
    r.approval_state === "awaiting" ? pc.yellow(" awaiting approval") : "";
  return `${key} ${statusTag(r.status)} ${r.title}${steps}${gate}`;
}

function formatSubtask(r: ProjectTask, index: number): string {
  const n = pc.dim(String(index).padStart(2, "0"));
  const role = r.role ? pc.dim(` [${r.role}]`) : "";
  const scope = r.scope_paths?.length ? pc.dim(`  owns: ${r.scope_paths.join(", ")}`) : "";
  return `${n} ${statusTag(r.status)} ${r.title}${role}${scope}`;
}

function printTask(row: TaskDetail): void {
  line(`${pc.bold(row.title)}  ${pc.dim(row.key ?? row.id)}`);
  line(`${statusTag(row.status)}  approval: ${row.approval_state}`);
  if (row.summary) line(`\n${row.summary}`);
  if (row.targets?.length) {
    line(
      `\ntouches: ${row.targets.map((t) => t.appName ?? t.ref ?? t.kind).join(", ")}`,
    );
  }
  if (row.subtasks?.length) {
    line(`\n${pc.bold("steps")}`);
    row.subtasks.forEach((s, i) => line(formatSubtask(s, i + 1)));
  } else {
    line(pc.dim("\nNo steps yet."));
  }
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
