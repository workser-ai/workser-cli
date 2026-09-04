import type { Command } from "commander";
import pc from "picocolors";

import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ok, line, success } from "../output.js";
import {
  bar,
  dimensionLine,
  shouldFail,
  usageState,
  usageSummary,
  type UsageDimension,
  type UsageReport,
} from "../usage.js";

/**
 * `workser usage` — what this project and its organisation are using.
 *
 * WHO ASKS. An owner, before they buy something; and an agent, before it
 * proposes something that will not fit. "Add another project" is a plan an
 * agent can only sensibly make if it can find out that the plan allows two and
 * two exist.
 *
 * TWO SCOPES IN ONE ANSWER, and that is honest rather than sloppy. Storage
 * allowances belong to the ORGANISATION — one pool across every project — while
 * the caps that actually stop you (projects; apps in this project) are counted
 * where they apply. Flattening them would imply a per-project storage limit
 * that does not exist.
 *
 * EXIT CODE. Non-zero only when a HARD cap is reached — the next project or the
 * next app would be refused. Going over a SOFT allowance is billed, not
 * blocked, and failing a script for it would make every over-quota customer's
 * automation start breaking on the day they became a bigger customer.
 */
export function registerUsage(program: Command): void {
  const usage = program
    .command("usage")
    .description("What this project and your plan are using — storage, projects, apps")
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const report = (await api(
          ctx,
          `/v1/projects/${projectId}/usage`,
        )) as UsageReport;

        ok(report, () => print(report));

        if (shouldFail(report)) process.exitCode = 1;
      }),
    );

  /**
   * `workser usage infra` — what the running software costs, right now.
   *
   * ─── A DIFFERENT QUESTION FROM `workser usage` ──────────────────────────
   *
   * That one answers "how much of what I bought is gone" — allowances, caps,
   * seats. This answers "what is the thing I built costing me": the database
   * it queries, the files it stores, the bytes it serves. An owner testing a
   * video feature wants the second, and every number in the first is silent
   * about it.
   *
   * ─── EVERY FIGURE SAYS HOW OLD IT IS ────────────────────────────────────
   *
   * Storage, database and deploys are read on demand and are true now.
   * BANDWIDTH IS NOT AND CANNOT BE: Vercel reports closed days only, so it
   * carries the last close and when it next moves. Printed that way rather
   * than averaged into one figure — an agent quoting "your egress this month"
   * as if it were current would be wrong by up to a day, and would have no way
   * to know.
   *
   * A dimension nothing could measure prints "not measured", never 0. Zero is
   * a claim that nothing was used, and only one of those is safe to repeat to
   * a customer.
   */
  // A SUBCOMMAND of `usage`, not a second top-level command. `usage` keeps its
  // own action, so `workser usage` behaves exactly as it did and
  // `workser usage infra` is the narrower question.
  usage
    .command("infra")
    .description(
      "What this project's cloud is costing — storage, database, deploys, bandwidth",
    )
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const usage = (await api(
          ctx,
          `/v1/projects/${projectId}/infra-usage`,
        )) as InfraUsage;
        ok(usage, () => printInfra(usage));
      }),
    );
}

/** One dimension, as `/infra-usage` reports it. */
interface InfraDimension {
  value: number | null;
  asOf: string;
  live: boolean;
  nextUpdate?: string;
}

interface InfraUsage {
  dbGb: InfraDimension;
  storageGb: InfraDimension;
  deploys: InfraDimension;
  bandwidthGb: InfraDimension;
}

function printInfra(usage: InfraUsage): void {
  const rows: Array<[string, InfraDimension, string]> = [
    ["Database", usage.dbGb, "GB"],
    ["File storage", usage.storageGb, "GB"],
    ["Bandwidth", usage.bandwidthGb, "GB"],
    ["Deploys", usage.deploys, ""],
  ];

  const width = Math.max(...rows.map(([label]) => label.length));
  for (const [label, dim, unit] of rows) {
    // "not measured" and "0" are different answers and are printed
    // differently — see this command's own doc comment.
    const value =
      dim.value === null
        ? pc.dim("not measured")
        : `${dim.value}${unit ? ` ${unit}` : ""}`;
    const when = dim.live
      ? pc.dim("now")
      : pc.dim(`through ${shortDay(dim.asOf)}`);
    line(`  ${label.padEnd(width)}  ${value}  ${when}`);
  }

  // Said once, at the bottom, rather than on every stale row: the reason is
  // the same for all of them and repeating it would bury the numbers.
  const stale = rows.find(([, dim]) => !dim.live && dim.nextUpdate);
  if (stale) {
    line("");
    line(
      pc.dim(
        `Bandwidth is reported by the host in closed days, so it updates once a day — next around ${shortTime(
          stale[1].nextUpdate!,
        )}.`,
      ),
    );
  }
}

function shortDay(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "—";
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? `${d.toISOString().slice(11, 16)} UTC`
    : "—";
}

function print(report: UsageReport): void {
  const dims = report.dimensions ?? [];
  if (!dims.length) {
    return line(pc.dim("Nothing to measure for this project yet."));
  }

  const width = Math.max(...dims.map((d) => d.label.length));
  for (const d of dims) {
    line(`  ${colour(d)(dimensionLine(d).padEnd(0))}${gauge(d, width)}`);
  }

  line("");
  const summary = usageSummary(report);
  const worst = dims.map(usageState);
  if (worst.includes("over")) line(pc.red(summary));
  else if (worst.includes("near") || worst.includes("unknown"))
    line(pc.yellow(summary));
  else success(summary);
}

/**
 * The bar, after the sentence.
 *
 * Absent for anything unmeasured or unlimited — an empty bar reads as "none
 * used", which for a figure nobody could read is a claim we have not earned.
 */
function gauge(d: UsageDimension, _labelWidth: number): string {
  const drawn = bar(d);
  return drawn ? `  ${pc.dim(drawn)}` : "";
}

function colour(d: UsageDimension): (s: string) => string {
  switch (usageState(d)) {
    case "over":
      // Red for a hard cap; amber for a soft one, which is billed rather than
      // broken. Same word, different consequence.
      return d.kind === "hard" ? pc.red : pc.yellow;
    case "near":
      return pc.yellow;
    case "unknown":
      return pc.dim;
    default:
      return (s: string) => s;
  }
}
