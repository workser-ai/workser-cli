import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject, requireLocalApp } from "../context.js";
import { ok, success, line, warn } from "../output.js";

/**
 * `workser sync` — reconcile this folder with the copy Workser holds.
 *
 * Pull first, then push, which is the order that makes a two-way sync safe:
 * pushing first would put the local state on top of changes you have not seen.
 *
 * NO GIT REMOTE IS INVOLVED, and that is the point. Code moves as git BUNDLES
 * over the Workser API, authenticated by the same session everything else here
 * uses. The folder has no `origin`, no credential is read, and the user's own
 * git identity and keys are never touched. That is what makes this work on a
 * machine that has no access to the Workser-managed repository — which is every
 * machine, including the user's: nobody has repo access, the API does.
 */
export function registerSync(program: Command): void {
  program
    .command("sync")
    .description(
      "Reconcile this folder with the copy Workser holds (pull, then push)",
    )
    .option("--branch <name>", "which branch to sync (default: this folder's)")
    .option(
      "--app <webAppId>",
      "which app's code this folder holds (default: resolved from the folder)",
    )
    .addHelpText(
      "after",
      "\nUse this instead of `git pull` / `git push` — this folder has no remote.\n",
    )
    .action(
      action(async ({ ctx, opts }) => {
        requireLocalApp(ctx, "sync");
        const projectId = requireProject(ctx);
        const res = await api(ctx, `/v1/projects/${projectId}/git/sync`, {
          body: {
            cwd: ctx.cwd,
            ...(opts.branch ? { branch: opts.branch } : {}),
            ...(opts.app ? { webAppId: opts.app } : {}),
          },
        });

        // The daemon answers 200 with `{ ok: false }` for an APPLICATION
        // failure (diverged history, nothing to sync) — a transport success
        // carrying a refusal. Reading only the HTTP status is how "sync failed"
        // gets reported as "Synced".
        const refused = res?.ok === false || res?.state === "diverged";

        ok(res, () => {
          if (refused) {
            warn(res?.message ?? "Couldn't sync this folder.");
            if (res?.state === "diverged") {
              line(
                pc.dim(
                  "  This folder and Workser's copy have both changed. Open Workser to resolve it.",
                ),
              );
            }
            return;
          }
          if (res?.state === "empty") {
            line("Nothing to sync yet — there's no code here or on Workser.");
            return;
          }
          success("Synced");
          if (res?.ref) line(pc.dim(`  ${String(res.ref).slice(0, 7)}`));
        });

        // OUTSIDE the printer, deliberately. `ok()` skips the human callback
        // entirely under `--json` — which is exactly how an agent calls this —
        // so setting the exit code in there made a refused sync exit 0 for the
        // one caller that gates on it.
        if (refused) process.exitCode = 1;
      }),
    );
}
