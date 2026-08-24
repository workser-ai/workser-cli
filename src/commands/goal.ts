import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject, type Context } from "../context.js";
import { ok, line, success } from "../output.js";
import { WorkserError } from "../errors.js";

/**
 * `workser goal` — the business requirement, and the shape of delivering it.
 *
 * THE LEVEL ABOVE A TASK, and the one that was missing. A tech team receives
 * business requirements — "customers can buy from my site" — and a business
 * requirement is by definition something that does not fit in one sitting.
 * Without this, every request became exactly one task, because the task row was
 * created from the message before anything got a chance to ask how big it was.
 *
 * PHASES ARE NAMES, NOT ROWS. A goal carries an ordered list of phase names;
 * a task joins one by carrying that name. So a phase cannot drift from the work
 * inside it, because it has no existence apart from that work.
 *
 * A GOAL HAS TO BE ARGUED FOR. Most requests are one task and should stay one
 * task — the failure mode of this whole idea is a manager that turns a
 * two-hour job into four milestones and buries the owner in ceremony before
 * anything is built. See `shouldBeGoal` in the agent's own instructions.
 */
interface PhaseProgress {
  name: string;
  index: number;
  total: number;
  done: number;
  accepted: number;
  working: number;
  state: "waiting" | "working" | "done";
}

interface Goal {
  id: string;
  title: string;
  outcome: string | null;
  phases: string[];
  status: string;
  progress?: PhaseProgress[];
  currentPhase?: string | null;
  taskTotal?: number;
  taskDone?: number;
}

const STATUSES = ["proposed", "agreed", "working", "delivered", "abandoned"] as const;

export function registerGoal(program: Command): void {
  const goal = program
    .command("goal")
    .description("Business goals and the phases that deliver them");

  goal
    .command("list")
    .description("What this project is working towards")
    .action(
      action(async ({ ctx }) => {
        requireProject(ctx);
        const rows =
          (await api<Goal[]>(ctx, "/v1/project-goals", {
            query: { projectId: ctx.projectId },
          })) ?? [];
        ok(rows, () => {
          if (!rows.length) {
            line(pc.dim("No goals yet — every task here stands on its own."));
            return;
          }
          for (const g of rows) line(formatGoal(g));
        });
      }),
    );

  goal
    .command("show <id>")
    .description("One goal: its phases, and how far each has got")
    .action(
      action(async ({ ctx, args }) => {
        const row = await api<Goal>(
          ctx,
          `/v1/project-goals/${encodeURIComponent(String(args[0]))}`,
        );
        ok(row, () => printGoal(row));
      }),
    );

  /**
   * PROPOSE THE SHAPE, BEFORE ANY OF THE WORK.
   *
   * The first answer to a business request is a list of slices with names and
   * an order, and nothing else. The owner agrees the SHAPE; the detail of each
   * slice is planned when that slice starts. Planning phase four now is waste —
   * it will change once phase one is real — and a twenty-five step approval is
   * one nobody reads.
   */
  goal
    .command("create <title>")
    .description(
      "Propose a business goal and the phases that deliver it — the owner agrees the shape before any task exists",
    )
    .option(
      "--outcome <text>",
      "what 'done' means for the whole thing, in the owner's words",
    )
    .option(
      "--phase <name...>",
      "ordered phase names — each must deliver something the owner would notice",
    )
    .action(
      action(async ({ ctx, args, opts }) => {
        requireProject(ctx);
        const phases: string[] = opts.phase ?? [];
        if (phases.length < 2) {
          // The guard that keeps this from becoming ceremony. If you cannot
          // name two slices that each deliver something visible, this is one
          // task, and a task is the right shape for it.
          throw new WorkserError(
            "A goal needs at least two phases. If you can't name two slices that each deliver something the owner would notice, this is one task — use `workser task create`.",
          );
        }
        if (phases.length > 6) {
          throw new WorkserError(
            "More than six phases is a conversation, not a plan. Propose the first few and agree the rest as you go.",
          );
        }
        const row = await api<Goal>(ctx, "/v1/project-goals", {
          body: {
            projectId: ctx.projectId,
            title: args[0],
            outcome: opts.outcome,
            phases,
            channelId: ctx.projectChannelId,
            sourceMessageId: ctx.projectChannelMessageId,
          },
        });
        ok(row, () => {
          success(`Proposed ${pc.bold(row?.title ?? "goal")}`);
          printGoal(row);
          line(
            pc.dim(
              "\nNothing has been created yet. The owner agrees the shape first.",
            ),
          );
        });
      }),
    );

  goal
    .command("update <id>")
    .description("Change the shape, or move the goal along")
    .option("--title <text>", "the owner's words for what they want")
    .option("--outcome <text>", "what 'done' means")
    .option("--phase <name...>", "replace the ordered phase list")
    .option("--status <value>", `one of: ${STATUSES.join(" | ")}`)
    .action(
      action(async ({ ctx, args, opts }) => {
        if (opts.status && !STATUSES.includes(opts.status)) {
          throw new WorkserError(
            `Unknown status "${opts.status}". Use one of: ${STATUSES.join(", ")}.`,
          );
        }
        const row = await api<Goal>(
          ctx,
          `/v1/project-goals/${encodeURIComponent(String(args[0]))}`,
          {
            method: "PATCH",
            body: {
              title: opts.title,
              outcome: opts.outcome,
              phases: opts.phase,
              status: opts.status,
            },
          },
        );
        ok(row, () => printGoal(row));
      }),
    );
}

function formatGoal(g: Goal): string {
  const where =
    g.currentPhase && g.status !== "delivered"
      ? pc.dim(`  now: ${g.currentPhase}`)
      : "";
  const count =
    g.taskTotal != null ? pc.dim(`  ${g.taskDone}/${g.taskTotal} done`) : "";
  return `${statusTag(g.status)} ${g.title}${where}${count}  ${pc.dim(g.id)}`;
}

function printGoal(g: Goal | null): void {
  if (!g) return;
  line(`${pc.bold(g.title)}  ${pc.dim(g.id)}`);
  line(statusTag(g.status));
  if (g.outcome) line(`\ndone means: ${g.outcome}`);

  const progress = g.progress ?? [];
  if (!progress.length) {
    line(pc.dim("\nNo phases agreed yet."));
    return;
  }
  line(`\n${pc.bold("phases")}`);
  for (const p of progress) {
    const bar =
      p.total > 0 ? `${p.done}/${p.total} done` : pc.dim("nothing filed yet");
    const mark =
      p.state === "done"
        ? pc.green("done")
        : p.state === "working"
          ? pc.blue("working")
          : pc.dim("waiting");
    line(
      `  ${pc.dim(String(p.index).padStart(2, "0"))} ${p.name}  ${mark}  ${pc.dim(bar)}`,
    );
  }
  // The one sentence this whole level exists to produce.
  const current = progress.find((p) => p.name === g.currentPhase);
  if (current) {
    line(
      pc.dim(
        `\n${current.name} — ${current.done} of ${current.total} done (phase ${current.index} of ${progress.length}).`,
      ),
    );
  }
}

function statusTag(status: string): string {
  switch (status) {
    case "agreed":
      return pc.cyan("[agreed]");
    case "working":
      return pc.blue("[working]");
    case "delivered":
      return pc.green("[delivered]");
    case "abandoned":
      return pc.dim("[abandoned]");
    default:
      return pc.yellow("[proposed]");
  }
}

export type { Context };
