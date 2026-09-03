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
export interface PhaseProgress {
  name: string;
  index: number;
  total: number;
  done: number;
  accepted: number;
  working: number;
  state: "waiting" | "working" | "done";
  appIds?: string[];
  /** What "done" means for this part, and whether it has been checked. */
  criteria?: Criterion[];
}

export interface Criterion {
  id: string;
  text: string;
  met: boolean | null;
  note?: string | null;
}

export interface Goal {
  id: string;
  title: string;
  outcome: string | null;
  phases: Array<{ name: string; criteria?: Criterion[] } | string>;
  /**
   * Apps this goal touches, DERIVED from its tasks — not declared.
   *
   * A goal routinely spans several: a trading surface needs a web app, a
   * market-data service, an agent and a scheduler. Most of them do not exist
   * when the goal is proposed, so anything declared up front is wrong by the
   * second phase.
   */
  appIds?: string[];
  status: string;
  /**
   * How much to do before checking in — `slice | phase | all`.
   *
   * The owner's answer, and the manager is expected to honour it: with
   * `slice`, finish one task and come back rather than walking the phase.
   */
  pace?: string;
  progress?: PhaseProgress[];
  currentPhase?: string | null;
  taskTotal?: number;
  taskDone?: number;
}

const STATUSES = ["proposed", "agreed", "working", "delivered", "abandoned"] as const;

/**
 * How much to do before coming back to the owner.
 *
 * The manager PROPOSES one with the shape; the owner changes it on the plan
 * card. `phase` is the middle answer and the default — it neither stops after
 * every task nor runs unattended through work nobody has seen.
 */
const PACES = ["slice", "phase", "all"] as const;

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
    .option(
      "--criteria <json>",
      'what "done" means per phase, in the OWNER\'s words: \'{"Checkout":["A customer can pay by card and gets a receipt"]}\'',
    )
    .option(
      "--pace <value>",
      `how much to do before checking in — slice (one task, then show), phase (the current phase, the default), all (${PACES.join(" | ")})`,
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
        /**
         * CRITERIA ARE AGREED WITH THE SHAPE, not written afterwards.
         *
         * Written at the end they are a description of what got built. The
         * whole value is stating them while they can still change the plan —
         * which is this moment, before anything exists.
         */
        let criteria: Record<string, string[]> = {};
        if (opts.criteria) {
          try {
            criteria = JSON.parse(opts.criteria);
          } catch {
            throw new WorkserError(
              '--criteria must be JSON mapping each phase name to a list of sentences, e.g. \'{"Checkout":["A customer can pay by card"]}\'',
            );
          }
          const unknown = Object.keys(criteria).filter(
            (name) => !phases.includes(name),
          );
          if (unknown.length) {
            // Silently dropping these would leave the author believing the
            // criteria landed on a phase that never carried them.
            throw new WorkserError(
              `--criteria names phases that aren't in this goal: ${unknown.join(", ")}. Phases are: ${phases.join(", ")}.`,
            );
          }
        }

        // Refused rather than coerced, and the refusal names the three: a
        // typo that silently became `all` would be a typo that ran unattended
        // through work the owner never agreed to.
        if (opts.pace !== undefined && !PACES.includes(opts.pace)) {
          throw new WorkserError(
            `Unknown --pace "${opts.pace}". Use one of: ${PACES.join(", ")}.`,
          );
        }

        const row = await api<Goal>(ctx, "/v1/project-goals", {
          body: {
            projectId: ctx.projectId,
            title: args[0],
            outcome: opts.outcome,
            pace: opts.pace,
            phases: phases.map((name) => ({
              name,
              criteria: (criteria[name] ?? []).map((text, i) => ({
                id: `c${i + 1}`,
                text,
                met: null,
              })),
            })),
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

  /**
   * QA'S VERDICT — the act that makes "done" checkable rather than asserted.
   *
   * A criterion is the owner's sentence about their own world; this records
   * whether it is true, and what was checked to find out. A tick with no
   * evidence is worse than no tick: it is a claim they cannot verify, on the
   * one screen where they are being asked to trust the team. So `--note` is
   * required on a pass.
   */
  goal
    .command("check <id> <criterionId>")
    .description('Record whether an acceptance criterion is met')
    .requiredOption("--phase <name>", "which part of the plan it belongs to")
    .option("--pass", "it is met")
    .option("--fail", "it is not met")
    .option("--reset", "back to unchecked")
    .option("--note <text>", "what you checked, and how")
    .action(
      action(async ({ ctx, args, opts }) => {
        const chosen = [opts.pass, opts.fail, opts.reset].filter(Boolean);
        if (chosen.length !== 1) {
          throw new WorkserError(
            "Pass exactly one of --pass, --fail or --reset.",
          );
        }
        if (opts.pass && !opts.note) {
          throw new WorkserError(
            "--note is required on a pass: say what you checked. A tick the owner cannot verify is worse than no tick.",
          );
        }
        const met = opts.pass ? true : opts.fail ? false : null;
        const row = await api<{ recorded?: boolean }>(
          ctx,
          `/v1/project-goals/${encodeURIComponent(String(args[0]))}/criteria/${encodeURIComponent(String(args[1]))}`,
          { method: "POST", body: { phase: opts.phase, met, note: opts.note } },
        );
        ok(row, () =>
          line(
            row?.recorded
              ? met === true
                ? pc.green("recorded — met")
                : met === false
                  ? pc.yellow("recorded — not met")
                  : pc.dim("recorded — back to unchecked")
              : pc.yellow(
                  "couldn't record it — check the goal id, the phase name and the criterion id",
                ),
          ),
        );
      }),
    );

  /**
   * ADOPTING WORK THAT ALREADY EXISTS.
   *
   * THE CASE THIS IS FOR, and it is the common one rather than the edge: a
   * project that was handed work one request at a time, for weeks, and only
   * now has somebody writing down what all of it was actually part of. Without
   * this the plan can be proposed and the finished work cannot be put under
   * it — so the owner agrees a plan that immediately reads as though nothing
   * has ever been built, which is worse than having had no plan.
   *
   * PLURAL BECAUSE THE REAL CALL IS PLURAL. Adopting five tasks one command at
   * a time is five round trips and five chances to stop halfway.
   *
   * THE PHASE IS CHECKED AGAINST THE GOAL, here, before anything is written.
   * `phase` is a join key held as a bare string on the task, so a typo does
   * not fail — it files the work under a slice that does not exist, and the
   * plan renders a part with nothing in it. That failure is invisible and
   * looks exactly like work that has not started.
   */
  goal
    .command("adopt <id>")
    .description(
      "File tasks that already exist under a part of this plan — for work done before the plan was written",
    )
    .option("--task <id...>", "the tasks to file under it")
    .option("--phase <name>", "which part of the plan they belong to")
    .action(
      action(async ({ ctx, args, opts }) => {
        requireProject(ctx);
        const goalId = String(args[0]);
        const taskIds: string[] = opts.task ?? [];
        if (!taskIds.length) {
          throw new WorkserError(
            "Name the tasks to file, e.g. `--task WORK-12 WORK-13`.",
          );
        }
        const goal = await api<Goal>(
          ctx,
          `/v1/project-goals/${encodeURIComponent(goalId)}`,
        );
        if (!goal) throw new WorkserError(`No goal ${goalId}.`);
        const names = (goal.phases ?? []).map((p) =>
          typeof p === "string" ? p : p.name,
        );
        const phase = String(opts.phase ?? "").trim();
        if (!phase || !names.includes(phase)) {
          throw new WorkserError(
            `--phase must be one of this goal's parts: ${names.join(", ")}.`,
          );
        }

        const filed: string[] = [];
        for (const taskId of taskIds) {
          await api(ctx, `/v1/project-tasks/${encodeURIComponent(taskId)}`, {
            method: "PATCH",
            body: { goalId, phase },
          });
          filed.push(taskId);
        }
        ok({ goalId, phase, filed }, () => {
          success(
            `Filed ${filed.length} ${filed.length === 1 ? "task" : "tasks"} under ${pc.bold(phase)}`,
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
    .option("--pace <value>", `how much to do before checking in (${PACES.join(" | ")})`)
    .action(
      action(async ({ ctx, args, opts }) => {
        if (opts.status && !STATUSES.includes(opts.status)) {
          throw new WorkserError(
            `Unknown status "${opts.status}". Use one of: ${STATUSES.join(", ")}.`,
          );
        }
        if (opts.pace && !PACES.includes(opts.pace)) {
          throw new WorkserError(
            `Unknown --pace "${opts.pace}". Use one of: ${PACES.join(", ")}.`,
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
              pace: opts.pace,
            },
          },
        );
        ok(row, () => printGoal(row));
      }),
    );
}

function appScope(g: Goal): string {
  const n = g.appIds?.length ?? 0;
  // How many pieces the work has touched so far. Nothing yet is the honest
  // state of a goal whose shape has been agreed and whose first phase has not
  // started — not a gap in the data.
  if (!n) return "";
  return pc.dim(`  ${n} part${n === 1 ? "" : "s"} of the system`);
}

function formatGoal(g: Goal): string {
  const where =
    g.currentPhase && g.status !== "delivered"
      ? pc.dim(`  now: ${g.currentPhase}`)
      : "";
  const count =
    g.taskTotal != null ? pc.dim(`  ${g.taskDone}/${g.taskTotal} done`) : "";
  return `${statusTag(g.status)} ${g.title}${appScope(g)}${where}${count}  ${pc.dim(g.id)}`;
}

function printGoal(g: Goal | null): void {
  if (!g) return;
  line(`${pc.bold(g.title)}  ${pc.dim(g.id)}`);
  line(statusTag(g.status));
  if (g.outcome) line(`\ndone means: ${g.outcome}`);
  // The pace is a standing instruction to whoever reads this, so it is
  // printed with the status rather than buried: `slice` means finish one task
  // and come back, and an agent that skips this line walks the whole phase.
  if (g.pace) line(pc.dim(`pace: ${paceLine(g.pace)}`));

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
    // WHAT DONE MEANS, under the part it belongs to. This list is
    // simultaneously the requirement, the test plan and the QA report — one
    // thing rather than three that drift apart.
    for (const c of p.criteria ?? []) {
      const tick =
        c.met === true
          ? pc.green("✓")
          : c.met === false
            ? pc.red("✗")
            : pc.dim("·");
      line(`       ${tick} ${c.text}  ${pc.dim(c.id)}`);
      if (c.note) line(pc.dim(`         ${c.note}`));
    }
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

/** The pace, said as an instruction rather than as a word. */
function paceLine(pace: string): string {
  if (pace === "slice") return "slice — do ONE task, then stop and show the owner";
  if (pace === "all") return "all — work through the phases; report at the end";
  return "phase — the current phase, task by task";
}
