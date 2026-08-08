import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ok, line } from "../output.js";
import { WorkserError } from "../errors.js";
import { recordEntityStep } from "./record-step.js";

/**
 * `workser decision` / `workser requirement` — the project's structured memory
 * (`POST/GET /v1/projects/:id/architecture-decisions` and `.../requirements`,
 * `daemon/routes/memory-entities.ts`), the same tables Orbit's Project Memory
 * panel writes to.
 *
 * `list`/`show` are the reason this file matters. A decision that can be
 * written but never read is not memory — it is a write-only log, and it cannot
 * support the one thing the project memory exists for: a session six weeks
 * from now knowing why the codebase is the way it is, *before* it changes it.
 * The preamble in `role-runner.ts` now tells the agent to run
 * `workser decision list` while planning, which is only possible because of
 * these two verbs.
 *
 * DECISIONS ARE APPEND-ONLY ON PURPOSE. There is no `decision update`: an
 * architecture decision record is a statement of what was decided at a point
 * in time, and the honest way to change one is to record a new decision that
 * supersedes it — editing history is how a decision log stops being trustworthy.
 * Requirements are different (a requirement legitimately moves
 * proposed → accepted → done), so those do get `update`.
 *
 * Requirements get NO thread card (`recordEntityStep` is still called, so the
 * step lands in the run's history) — `ProjectMemoryPanel.tsx` has no list UI
 * for requirements yet, so a click-through card would have nowhere to send
 * the user. See the plan's scope decision 5.
 */
interface DecisionRow {
  id: string;
  title: string;
  context: string;
  decision: string;
  consequences: string | null;
  status: string;
  filePath: string | null;
  createdAt: string;
}

interface RequirementRow {
  id: string;
  title: string;
  body: string;
  status: string;
  filePath: string | null;
  createdAt: string;
}

export function registerDecision(program: Command): void {
  const decision = program
    .command("decision")
    .description("Read and record the project's architecture decisions");

  decision
    .command("list")
    .description("Every decision on record — read this before changing how something works")
    .option("--limit <n>", "cap the number returned (newest first)")
    .action(
      action(async ({ ctx, opts }) => {
        const projectId = requireProject(ctx);
        let rows =
          (await api<DecisionRow[]>(
            ctx,
            `/v1/projects/${projectId}/architecture-decisions`,
          )) ?? [];
        rows = applyLimit(rows, opts.limit);
        ok(rows, () => {
          if (!rows.length) {
            line(pc.dim("No decisions recorded yet."));
            return;
          }
          for (const r of rows) {
            line(`${pc.dim(r.id)}  ${pc.dim(shortDate(r.createdAt))}  ${r.title}`);
            line(`    ${truncate(r.decision, 100)}`);
          }
        });
      }),
    );

  decision
    .command("show <id>")
    .description("The full record — context, decision, and consequences")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const row = await api<DecisionRow>(
          ctx,
          `/v1/projects/${projectId}/architecture-decisions/${args[0]}`,
        );
        ok(row, () => {
          line(`${pc.bold(row.title)}  ${pc.dim(row.id)}`);
          line(pc.dim(`${row.status} · ${shortDate(row.createdAt)}`));
          line(`\n${pc.bold("Context")}\n${row.context}`);
          line(`\n${pc.bold("Decision")}\n${row.decision}`);
          if (row.consequences) line(`\n${pc.bold("Consequences")}\n${row.consequences}`);
        });
      }),
    );

  decision
    .command("create <title>")
    .description(
      "workser decision create \"Use Postgres\" --context ... --decision ... [--consequences ...]",
    )
    .requiredOption("--context <text>", "why this decision was needed")
    .requiredOption("--decision <text>", "what was decided")
    .option("--consequences <text>", "tradeoffs / follow-on effects")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const title = String(args[0] ?? "").trim();
        if (!title) {
          throw new WorkserError("A decision needs a title.", { code: "bad_request" });
        }

        const row = await api(ctx, `/v1/projects/${projectId}/architecture-decisions`, {
          body: {
            title,
            context: opts.context,
            decision: opts.decision,
            consequences: opts.consequences,
            conversationId: ctx.conversationId,
          },
        });

        await recordEntityStep(ctx, {
          title: `Recorded decision: ${title}`,
          refType: "agent_created_decision",
          refId: row?.id,
          output: { decision: row },
        });

        ok(row, () => line(`Recorded decision ${pc.bold(row?.id ?? "")} — ${title}`));
      }),
    );

  const requirement = program
    .command("requirement")
    .description("Read and record the project's requirements");

  requirement
    .command("list")
    .description("Every requirement on record — read this before deciding what to build")
    .option("--status <value>", "only requirements in this status, e.g. accepted")
    .option("--limit <n>", "cap the number returned (newest first)")
    .action(
      action(async ({ ctx, opts }) => {
        const projectId = requireProject(ctx);
        let rows =
          (await api<RequirementRow[]>(ctx, `/v1/projects/${projectId}/requirements`)) ?? [];
        if (opts.status) rows = rows.filter((r) => r.status === opts.status);
        rows = applyLimit(rows, opts.limit);
        ok(rows, () => {
          if (!rows.length) {
            line(pc.dim("No requirements recorded yet."));
            return;
          }
          for (const r of rows) {
            line(`${pc.dim(r.id)}  ${r.status.padEnd(9)}  ${r.title}`);
          }
        });
      }),
    );

  requirement
    .command("show <id>")
    .description("The full requirement text")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const row = await api<RequirementRow>(
          ctx,
          `/v1/projects/${projectId}/requirements/${args[0]}`,
        );
        ok(row, () => {
          line(`${pc.bold(row.title)}  ${pc.dim(row.id)}`);
          line(pc.dim(`${row.status} · ${shortDate(row.createdAt)}`));
          line(`\n${row.body}`);
        });
      }),
    );

  requirement
    .command("create <title>")
    .description("workser requirement create \"Support SSO\" --body ... [--status ...]")
    .requiredOption("--body <text>", "the requirement's text")
    .option("--status <text>", "e.g. proposed | accepted | done")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const title = String(args[0] ?? "").trim();
        if (!title) {
          throw new WorkserError("A requirement needs a title.", { code: "bad_request" });
        }

        const row = await api(ctx, `/v1/projects/${projectId}/requirements`, {
          body: {
            title,
            body: opts.body,
            status: opts.status,
          },
        });

        await recordEntityStep(ctx, {
          title: `Recorded requirement: ${title}`,
          refType: "agent_created_requirement",
          refId: row?.id,
          output: { requirement: row },
        });

        ok(row, () => line(`Recorded requirement ${pc.bold(row?.id ?? "")} — ${title}`));
      }),
    );

  requirement
    .command("update <id>")
    .description(
      "Move a requirement along, e.g. `workser requirement update <id> --status done`",
    )
    .option("--title <text>", "new title")
    .option("--body <text>", "new requirement text")
    .option("--status <text>", "e.g. proposed | accepted | done")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const body: Record<string, unknown> = {
          title: opts.title,
          body: opts.body,
          status: opts.status,
        };
        if (Object.values(body).every((v) => v === undefined)) {
          throw new WorkserError(
            "Nothing to update — pass at least one of --title, --body, --status.",
            { code: "bad_request" },
          );
        }
        const row = await api<RequirementRow>(
          ctx,
          `/v1/projects/${projectId}/requirements/${args[0]}`,
          { method: "PATCH", body },
        );
        if (!row) {
          throw new WorkserError(`No requirement with id "${args[0]}" on this project.`, {
            code: "bad_request",
          });
        }
        ok(row, () => line(`Updated requirement ${pc.bold(row.id)} — ${row.title} (${row.status})`));
      }),
    );
}

function applyLimit<T>(rows: T[], limit: string | undefined): T[] {
  if (limit === undefined) return rows;
  const n = Number(limit);
  if (!Number.isFinite(n) || n < 1) {
    throw new WorkserError(`--limit must be a positive number, got "${limit}".`, {
      code: "bad_request",
    });
  }
  return rows.slice(0, n);
}

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Dates are only ever shown next to a title, so the day is enough. */
function shortDate(iso: string | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}
