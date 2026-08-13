import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireLocalApp } from "../context.js";
import { ok, success, line, info } from "../output.js";

/**
 * `workser checkpoint` / `workser restore` — save a spot, and go back to it.
 *
 * THE GAP THESE CLOSE. Workser owns this folder's version control: there is no
 * remote, and an agent that runs `git commit` or `git stash` in here turns the
 * next sync into a conflict its user has to resolve by hand. So agents are told
 * not to. But "don't" only works if there is a "do" — and there wasn't one. A
 * restore point could only be taken by the daemon at the START of a turn, which
 * left an agent about to attempt something risky with no way to mark where it
 * stood, and left an INTERRUPTED run's work sitting in a stash nobody would pop.
 *
 * These are that "do". Same underlying restore points the cockpit's Undo button
 * uses, so a checkpoint taken here shows up there and vice versa — one history,
 * not two.
 *
 * Nothing is ever discarded: restoring commits the current state first, then
 * restores on top (see the daemon's undo.ts). The worst case of restoring the
 * wrong thing is restoring back.
 */
export function registerCheckpoint(program: Command): void {
  program
    .command("checkpoint [label]")
    .description(
      "Save the current state of this folder so you can come back to it",
    )
    .addHelpText(
      "after",
      "\nUse this before a risky change. To come back: `workser restore`.\n" +
        "Never use `git stash` or `git commit` here — Workser owns this history.\n",
    )
    .action(
      action(async ({ ctx, args }) => {
        requireLocalApp(ctx, "checkpoint");
        const label = typeof args[0] === "string" ? args[0] : "";
        const res = await api(ctx, `/v1/checkpoints`, {
          body: { cwd: ctx.cwd, ...(label ? { label } : {}) },
        });
        ok(res, () => {
          const p = res?.point;
          success(`Saved a checkpoint${p?.label ? `: ${p.label}` : ""}`);
          if (p?.ref) line(pc.dim(`  ${p.ref.slice(0, 7)}`));
          line(pc.dim("  Come back to it with `workser restore`."));
        });
      }),
    );

  const restore = program
    .command("restore [ref]")
    .description(
      "Put this folder back to a saved checkpoint (default: the most recent)",
    )
    .option("--list", "show the checkpoints you can go back to", false)
    .action(
      action(async ({ ctx, args, opts }) => {
        requireLocalApp(ctx, "restore");

        if (opts.list) {
          const res = await api(ctx, `/v1/checkpoints`, {
            query: { cwd: ctx.cwd },
          });
          const points: Array<{ ref: string; at: string; label: string }> =
            res?.points ?? [];
          return ok(res, () => printPoints(points));
        }

        const ref = typeof args[0] === "string" ? args[0].trim() : "";
        const res = await api(ctx, `/v1/undo`, {
          body: { cwd: ctx.cwd, ...(ref ? { ref } : {}) },
        });
        ok(res, () => {
          success(
            `Put the folder back${
              res?.restoredTo ? ` to ${String(res.restoredTo).slice(0, 7)}` : ""
            }`,
          );
          if (res?.filesChanged) {
            line(
              pc.dim(
                `  ${res.filesChanged} file${res.filesChanged === 1 ? "" : "s"} changed`,
              ),
            );
          }
          // Say this every time. Someone who has just restored is, by
          // definition, in the middle of recovering from a surprise — the one
          // moment they need to know that this too can be taken back.
          line(pc.dim("  This is reversible: `workser restore` again."));
        });
      }),
    );

  restore
    .command("list")
    .description("Show the checkpoints you can go back to")
    .action(
      action(async ({ ctx }) => {
        requireLocalApp(ctx, "restore list");
        const res = await api(ctx, `/v1/checkpoints`, {
          query: { cwd: ctx.cwd },
        });
        ok(res, () => printPoints(res?.points ?? []));
      }),
    );
}

function printPoints(
  points: Array<{ ref: string; at: string; label: string }>,
): void {
  if (!points.length) {
    info("No checkpoints yet for this folder.");
    line(pc.dim("  Take one with `workser checkpoint`."));
    return;
  }
  line(pc.bold("Checkpoints"));
  for (const p of points) {
    const when = p.at ? new Date(p.at).toLocaleString() : "";
    line(
      `  ${pc.dim(p.ref.slice(0, 7))}  ${p.label}${when ? pc.dim(`  ${when}`) : ""}`,
    );
  }
  line(
    pc.dim(
      "\nGo back with `workser restore <ref>`, or just `workser restore` for the newest.",
    ),
  );
}
