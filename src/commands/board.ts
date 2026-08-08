import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ok, line } from "../output.js";
import { WorkserError } from "../errors.js";
import { recordEntityStep } from "./record-step.js";

/**
 * `workser board` — the project's Board (work items), the same table a human
 * clicking "New" in Orbit's Board panel writes to
 * (`daemon/routes/work-items.ts`).
 *
 * READ IS THE POINT, not just write. `create` shipped alone first, and the
 * result was a Board that only ever grew: an agent could add a card but could
 * not see the ones already there (so it re-filed work that was already
 * tracked) and could not move one to `done` (so a card sat in `backlog` long
 * after the feature shipped, and the panel told the user the opposite of the
 * truth). `list`/`show` give a new session its continuity; `move`/`close` keep
 * the panel honest as the work actually progresses.
 *
 * `delete` is deliberately absent. Every other verb here is recoverable and
 * `done` is the correct terminal state for finished work; an agent silently
 * removing a card its user filed is not something a `--json` exit code can
 * undo. Deleting stays a human action in the Orbit UI.
 *
 * Literal `--status`/`--priority` values are mirrored from
 * `work-items-store.ts`'s `WORK_ITEM_STATUSES`/`WORK_ITEM_PRIORITIES` rather
 * than imported — this CLI has no build-time dependency on the desktop app's
 * source (same reasoning `ask.ts`'s `TYPES` gives for its own literal list).
 * If the daemon-side lists ever change, update both places.
 */
const STATUSES = ["backlog", "in-progress", "in-review", "done"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

interface WorkItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  labels: string[];
  ownerHuman: string | null;
  milestoneId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function registerBoard(program: Command): void {
  const board = program
    .command("board")
    .description("Read and update the project's Board (work items)");

  board
    .command("list")
    .description("List the Board's cards — run this before starting work")
    .option("--status <value>", `only cards in this status (${STATUSES.join(" | ")})`)
    .option("--label <value>", "only cards carrying this label")
    .option("--limit <n>", "cap the number of cards returned")
    .action(
      action(async ({ ctx, opts }) => {
        const projectId = requireProject(ctx);
        if (opts.status !== undefined) assertStatus(opts.status);

        // The daemon's list route takes no query parameters — it returns the
        // project's cards and nothing else — so filtering happens here. A
        // Board is a human-sized list (tens of cards, not thousands), which is
        // why that route was never given a filter to push this down into.
        const all = (await api<WorkItem[]>(ctx, `/v1/projects/${projectId}/work-items`)) ?? [];
        let rows = all;
        if (opts.status) rows = rows.filter((r) => r.status === opts.status);
        if (opts.label) rows = rows.filter((r) => (r.labels ?? []).includes(opts.label));
        if (opts.limit) {
          const n = Number(opts.limit);
          if (!Number.isFinite(n) || n < 1) {
            throw new WorkserError(`--limit must be a positive number, got "${opts.limit}".`, {
              code: "bad_request",
            });
          }
          rows = rows.slice(0, n);
        }

        ok(rows, () => {
          if (!rows.length) {
            line(pc.dim("No cards on the Board yet."));
            return;
          }
          for (const r of rows) line(formatRow(r));
        });
      }),
    );

  board
    .command("show <id>")
    .description("Show one card in full, e.g. `workser board show <id>`")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const row = await api<WorkItem>(
          ctx,
          `/v1/projects/${projectId}/work-items/${args[0]}`,
        );
        ok(row, () => {
          line(`${pc.bold(row.title)}  ${pc.dim(row.id)}`);
          line(`${statusTag(row.status)}  priority ${row.priority}`);
          if (row.ownerHuman) line(`owner: ${row.ownerHuman}`);
          if (row.labels?.length) line(`labels: ${row.labels.join(", ")}`);
          if (row.description) line(`\n${row.description}`);
        });
      }),
    );

  board
    .command("create <title>")
    .description("Create a work item, e.g. `workser board create \"Fix the login bug\"`")
    .option("--description <text>", "longer description")
    .option("--status <value>", `${STATUSES.join(" | ")} (default: backlog)`)
    .option("--priority <value>", `${PRIORITIES.join(" | ")} (default: normal)`)
    .option(
      "--label <value>",
      "a label to attach (repeat for more)",
      collect,
      [] as string[],
    )
    .option("--owner <name>", "the human who owns this card")
    .option("--milestone <id>", "milestone id to attach this card to")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const title = String(args[0] ?? "").trim();
        if (!title) {
          throw new WorkserError("A work item needs a title.", { code: "bad_request" });
        }

        if (opts.status !== undefined) assertStatus(opts.status);
        if (opts.priority !== undefined) assertPriority(opts.priority);

        const labels = opts.label as string[];

        const row = await api(ctx, `/v1/projects/${projectId}/work-items`, {
          body: {
            title,
            description: opts.description,
            status: opts.status,
            priority: opts.priority,
            labels: labels.length ? labels : undefined,
            ownerHuman: opts.owner,
            milestoneId: opts.milestone,
          },
        });

        await recordEntityStep(ctx, {
          title: `Created work item: ${title}`,
          refType: "agent_created_work_item",
          refId: row?.id,
          output: { workItem: row },
        });

        ok(row, () => line(`Created work item ${pc.bold(row?.id ?? "")} — ${title}`));
      }),
    );

  board
    .command("update <id>")
    .description("Change fields on a card — pass only what changes")
    .option("--title <text>", "new title")
    .option("--description <text>", "new description")
    .option("--status <value>", STATUSES.join(" | "))
    .option("--priority <value>", PRIORITIES.join(" | "))
    .option(
      "--label <value>",
      "replace the card's labels with these (repeat for more)",
      collect,
      [] as string[],
    )
    .option("--owner <name>", "the human who owns this card")
    .option("--milestone <id>", "milestone id to attach this card to")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        if (opts.status !== undefined) assertStatus(opts.status);
        if (opts.priority !== undefined) assertPriority(opts.priority);

        const labels = opts.label as string[];
        const body: Record<string, unknown> = {
          title: opts.title,
          description: opts.description,
          status: opts.status,
          priority: opts.priority,
          // Commander's default `[]` is indistinguishable from "the user asked
          // for zero labels", so an empty array means "not specified" here.
          // Clearing labels is a rare enough intent to leave to the UI rather
          // than overload a flag that cannot express it unambiguously.
          labels: labels.length ? labels : undefined,
          ownerHuman: opts.owner,
          milestoneId: opts.milestone,
        };
        if (Object.values(body).every((v) => v === undefined)) {
          throw new WorkserError(
            "Nothing to update — pass at least one of --title, --description, --status, " +
              "--priority, --label, --owner, --milestone.",
            { code: "bad_request" },
          );
        }

        const row = await patchItem(ctx, projectId, String(args[0]), body);
        ok(row, () => line(`Updated ${pc.bold(row.id)} — ${row.title} ${statusTag(row.status)}`));
      }),
    );

  board
    .command("move <id> <status>")
    .description(
      `Move a card to ${STATUSES.join(" | ")} — the one-liner for keeping the Board honest`,
    )
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const status = String(args[1]);
        assertStatus(status);
        const row = await patchItem(ctx, projectId, String(args[0]), { status });
        ok(row, () => line(`Moved ${pc.bold(row.title)} → ${statusTag(row.status)}`));
      }),
    );

  board
    .command("close <id>")
    .description("Shorthand for `board move <id> done`")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const row = await patchItem(ctx, projectId, String(args[0]), { status: "done" });
        ok(row, () => line(`Closed ${pc.bold(row.title)} ${statusTag(row.status)}`));
      }),
    );
}

async function patchItem(
  ctx: Parameters<typeof api>[0],
  projectId: string,
  id: string,
  body: Record<string, unknown>,
): Promise<WorkItem> {
  const row = await api<WorkItem>(ctx, `/v1/projects/${projectId}/work-items/${id}`, {
    method: "PATCH",
    body,
  });
  if (!row) {
    throw new WorkserError(`No work item with id "${id}" on this project.`, {
      code: "bad_request",
    });
  }
  return row;
}

function assertStatus(value: string): void {
  if (!(STATUSES as readonly string[]).includes(value)) {
    throw new WorkserError(
      `Unknown status "${value}". Use one of: ${STATUSES.join(", ")}.`,
      { code: "bad_request" },
    );
  }
}

function assertPriority(value: string): void {
  if (!(PRIORITIES as readonly string[]).includes(value)) {
    throw new WorkserError(
      `Unknown priority "${value}". Use one of: ${PRIORITIES.join(", ")}.`,
      { code: "bad_request" },
    );
  }
}

/** One card on one line — id first, because every other verb takes an id. */
function formatRow(r: WorkItem): string {
  const labels = r.labels?.length ? pc.dim(` [${r.labels.join(", ")}]`) : "";
  const owner = r.ownerHuman ? pc.dim(` @${r.ownerHuman}`) : "";
  return `${pc.dim(r.id)}  ${statusTag(r.status)}  ${r.title}${labels}${owner}`;
}

function statusTag(status: string): string {
  const label = status.padEnd(11);
  if (status === "done") return pc.green(label);
  if (status === "in-progress") return pc.yellow(label);
  if (status === "in-review") return pc.cyan(label);
  return pc.dim(label);
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}
