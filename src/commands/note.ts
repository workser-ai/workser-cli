import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { ok, success, line, info } from "../output.js";

/**
 * `workser note` — leave the rest of the team a fact.
 *
 * WHAT THIS IS FOR, and what it is NOT for.
 *
 * `task done --summary` reports what a STEP did, to the owner. This reports
 * what is now TRUE about the work, to the teammates who come next — and those
 * are different sentences with different readers. "Rebuilt the checkout page"
 * belongs in a summary. "The payment API is mounted at /api/v2/pay, not
 * /api/pay like the docs say" belongs here: the next three steps need it, none
 * of them will find it without spending a turn, and the owner does not care.
 *
 * WHY IT MATTERS MORE HERE THAN IT WOULD ANYWHERE ELSE. Workser's teammates do
 * not share a mind. Two steps on the same CLI can resume one transcript; a
 * Claude step and a Codex step cannot, and running the right agent for each
 * job is the entire promise. This is the channel that crosses that boundary —
 * plain text the daemon holds, readable by anything.
 *
 * BEST-EFFORT, NEVER FATAL. A note that could not be saved is a slower next
 * step. Failing the command over it would turn a lost annotation into lost
 * work, so this reports the problem and exits clean.
 *
 * The board is per PLAN and lives in the project folder — see the daemon's
 * `team-memory.ts`. Every later step is handed it without having to ask.
 */
export function registerNote(program: Command): void {
  program
    .command("note <text>")
    .description("Leave a fact the rest of the team will need")
    .addHelpText(
      "after",
      "\nFor things that are true about the WORK, not about your step:\n" +
        '  workser note "the API base path is /api/v2, not /api"\n' +
        '  workser note "added STRIPE_KEY to local, preview and production"\n' +
        "\nWhat your own step did goes in `workser task done --summary` instead.\n",
    )
    .option(
      "--task <id>",
      "the plan to leave it on (default: the plan this step belongs to)",
    )
    .action(
      action(async ({ ctx, args, opts }) => {
        const text = typeof args[0] === "string" ? args[0].trim() : "";
        if (!text) {
          info("Nothing to note — give it a sentence.");
          return;
        }
        // The PLAN, not the step: a note belongs to the work, and the step it
        // was discovered in finishes long before the teammates who need it
        // start. `--task` is how a hand-run CLI says which plan it means.
        const taskId = opts.task || ctx.parentTaskId || ctx.projectTaskId;
        if (!taskId) {
          info(
            "No plan to leave this on. Run it from inside a step, or pass --task <id>.",
          );
          return;
        }
        const res = await api(ctx, "/v1/team-notes", {
          body: {
            cwd: ctx.cwd,
            taskId,
            text,
            role: ctx.agentRole,
            agent: ctx.agentType,
          },
        }).catch(() => null);
        if (!res) {
          info("Couldn't save that note — carrying on.");
          return;
        }
        ok(res, () => {
          success("Noted for the team.");
          line(pc.dim(`  ${text}`));
        });
      }),
    );
}
