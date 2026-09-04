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
  /** Free tags, shared with docs and work items — absent on an older API. */
  labels?: string[];
  /** Which app this decision is about, or null. */
  webAppId?: string | null;
  /** Which parts of the infrastructure it concerns. */
  infraRefs?: string[];
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
    // Narrowing, matched on the SERVER. Golden rule 2 tells every agent to read
    // this list before acting, and "read four hundred decisions" is advice
    // nobody follows — "read the eleven about the database" is.
    .option("--search <text>", "match the title, case-insensitively")
    .option("--label <name>", "only decisions carrying this label")
    .option("--app <id>", "only decisions about this app")
    .option("--infra <name>", "only decisions touching this part of the infrastructure")
    .option("--status <name>", "proposed | accepted | superseded")
    .action(
      action(async ({ ctx, opts }) => {
        const projectId = requireProject(ctx);
        let rows =
          (await api<DecisionRow[]>(
            ctx,
            `/v1/projects/${projectId}/architecture-decisions`,
            {
              query: {
                q: opts.search,
                label: opts.label,
                webAppId: opts.app,
                infra: opts.infra,
                status: opts.status,
                limit: opts.limit,
              },
            },
          )) ?? [];
        rows = applyLimit(rows, opts.limit);
        ok(rows, () => {
          if (!rows.length) {
            line(pc.dim("No decisions recorded yet."));
            return;
          }
          for (const r of rows) {
            const tags = [...(r.labels ?? []), ...(r.infraRefs ?? [])];
            const meta = tags.length ? pc.dim(`  [${tags.join(", ")}]`) : "";
            line(`${pc.dim(r.id)}  ${pc.dim(shortDate(r.createdAt))}  ${r.title}${meta}`);
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
    .command("supersede <id>")
    .description(
      "Retire a decision — `--reason` records why; `--delete` removes it outright",
    )
    /**
     * SUPERSEDING IS THE DEFAULT, AND DELETING IS NOT.
     *
     * A decision that was genuinely made and later reversed is worth keeping:
     * the record of having decided it is what stops the next agent quietly
     * deciding it again. `status: "superseded"` says "we changed our mind",
     * which is a different and more useful fact than the row not existing.
     *
     * `--delete` is for the other case — a row created by mistake, or by an
     * agent that misread what it was told. That one is worse than clutter,
     * because golden rule 2 tells every agent to read this list before acting,
     * so a wrong record is read as settled fact. Two flags rather than two
     * commands, so the safer one is what you get by typing less.
     */
    .option("--delete", "remove the record entirely — for a row created in error")
    .option("--reason <text>", "a note on why, appended to the label set")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const id = String(args[0] ?? "").trim();
        if (!id) {
          throw new WorkserError("Which decision?", { code: "bad_request" });
        }
        const path = `/v1/projects/${projectId}/architecture-decisions/${id}`;
        if (opts.delete) {
          await api(ctx, path, { method: "DELETE" });
          ok({ deleted: true, id }, () => line(`Deleted decision ${pc.bold(id)}.`));
          return;
        }
        const row = await api<DecisionRow>(ctx, path, {
          method: "PATCH",
          body: { status: "superseded" },
        });
        ok(row, () =>
          line(
            `Marked ${pc.bold(row?.title ?? id)} superseded.` +
              (opts.reason ? ` Record the replacement with \`decision create\`.` : ""),
          ),
        );
      }),
    );

  decision
    .command("tag <id>")
    .description("File an existing decision — labels, the app, the infrastructure")
    // Metadata only. The decision's TEXT is deliberately not editable: a
    // decision record states what was decided *then*, and the honest way to
    // change one is to record a new decision superseding it. None of these
    // fields is part of what was decided — they are how it is filed.
    .option("--label <name...>", "tag it — shares the project's label vocabulary")
    .option("--app <id>", "which app this decision is about")
    .option("--infra <name...>", "what it touches: database, storage, auth, …")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const id = String(args[0] ?? "").trim();
        const body = decisionMeta(opts);
        if (!id || Object.keys(body).length === 0) {
          throw new WorkserError(
            "Give a decision id and at least one of --label / --app / --infra.",
            { code: "bad_request" },
          );
        }
        const row = await api<DecisionRow>(
          ctx,
          `/v1/projects/${projectId}/architecture-decisions/${id}`,
          { method: "PATCH", body },
        );
        ok(row, () => line(`Filed decision ${pc.bold(row?.title ?? id)}.`));
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
    // WHAT IT IS ABOUT — so the next agent can find this decision by the thing
    // it constrains, rather than by reading every decision ever recorded.
    .option("--label <name...>", "tag it — shares the project's label vocabulary")
    .option("--app <id>", "which app this decision is about")
    .option(
      "--infra <name...>",
      "what it touches: database, storage, auth, domains, functions, env, connections, deploy",
    )
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
            ...decisionMeta(opts),
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

/**
 * The metadata a caller actually set — never a key it left alone.
 *
 * `--label a --label b` arrives as an array; a single `--label a` arrives as a
 * one-element array. An omitted flag stays `undefined`, which upstream reads as
 * "leave this alone" — so tagging a decision cannot clear its app relation.
 */
function decisionMeta(opts: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const labels = toList(opts.label);
  const infra = toList(opts.infra);
  if (labels) body.labels = labels;
  if (infra) body.infraRefs = infra;
  if (typeof opts.app === "string") body.webAppId = opts.app;
  return body;
}

function toList(value: unknown): string[] | undefined {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  return undefined;
}
