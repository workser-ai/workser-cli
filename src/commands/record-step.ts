import type { Context } from "../context.js";
import { api } from "../client.js";

/**
 * Correlate an entity this CLI just created (a work item, a decision, a
 * document, …) with the agent run/conversation that created it, by recording
 * a step on the run's own timeline — `POST /v1/runs/:runId/steps`
 * (`src-electron/orbit/daemon/routes/runs.ts`). The renderer's thread timeline
 * turns a step with one of these `refType`s into an inline "artifact" card
 * (see `threadTimeline.ts`), instead of the generic step-group noise.
 *
 * Best-effort, by design, matching the daemon's own `change-summary.ts`
 * philosophy: this is an annotation on work that already succeeded — the
 * entity write (work item / decision / document) already landed before this
 * runs — so a failure here is never worth surfacing as a command failure.
 *
 * No-ops silently when there is no run to correlate to (`ctx.runId` unset —
 * the CLI invoked by hand, or from CI): there is nothing for the step to
 * attach to, and that is not an error condition.
 */
export async function recordEntityStep(
  ctx: Context,
  opts: { title: string; refType: string; refId: string; output: Record<string, unknown> },
): Promise<void> {
  if (!ctx.runId) return;
  await api(ctx, `/v1/runs/${ctx.runId}/steps`, {
    body: {
      title: opts.title,
      refType: opts.refType,
      refId: opts.refId,
      output: opts.output,
    },
  }).catch(() => undefined);
}
