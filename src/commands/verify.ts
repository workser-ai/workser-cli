import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireLocalApp } from "../context.js";
import { ok, success, line } from "../output.js";

/**
 * `workser verify` — run the project's deterministic checks (typecheck / lint /
 * build) in the current directory. The reliability gate: run this BEFORE
 * declaring a task done; fix anything that fails and re-run until green. Exits
 * non-zero on failure so agents/scripts can gate on it.
 */
export function registerVerify(program: Command): void {
  program
    .command("verify")
    .description(
      "Run the project's checks (typecheck/lint/build) — use before declaring a task done",
    )
    .option(
      "--only <checks>",
      "comma-separated subset, e.g. --only typecheck,build",
    )
    .action(
      action(async ({ ctx, opts }) => {
        // Verify runs the project's checks IN THIS FOLDER, via the daemon.
        // Without one there is nothing to check, and the bare 404 this used to
        // return looked like a Workser outage.
        requireLocalApp(ctx, "verify");
        const only = opts.only
          ? String(opts.only)
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;
        const res = await api(ctx, `/v1/verify`, {
          body: { cwd: ctx.cwd, ...(only ? { only } : {}) },
        });
        ok(res, () => printVerify(res));
        if (res && res.ok === false) process.exitCode = 1;
      }),
    );
}

function printVerify(res: any): void {
  if (!res) return;
  if (!res.checks?.length) {
    line(pc.dim(res.note ?? "No checks detected."));
    return;
  }
  for (const c of res.checks) {
    line(
      `  ${c.ok ? pc.green("✓") : pc.red("✗")} ${c.name}${
        c.ok ? "" : pc.dim(` (exit ${c.exitCode})`)
      }`,
    );
  }
  if (res.ok) success("All checks passed");
  else
    line(
      pc.red("Some checks failed — fix the errors above and re-run ") +
        pc.bold("workser verify") +
        pc.red("."),
    );
}
