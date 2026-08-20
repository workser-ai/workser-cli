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
  program
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
