/**
 * WCOMP-051 — `workser code` over the Workser Code capability the desktop
 * exposes at `/v1/computer/code/*` (WCOMP-045).
 *
 * The CLI submits project/app-scoped requirements to the daemon capability,
 * follows the durable run, and prints the preview/artifact/revision references
 * that already exist — it owns no execution, credential or artifact authority
 * of its own, by the same boundary the capability keeps. The run is durable
 * (ai_agent_tasks + job_runs), so `status` and `artifacts` re-read it after
 * this process is gone.
 *
 *   POST /v1/computer/code/runs              {projectId, appId?, requirements, cwd, …}
 *   GET  /v1/computer/code/runs/:runId?projectId
 *   POST /v1/computer/code/runs/:runId/cancel {projectId}
 *   GET  /v1/computer/code/runs/:runId/results?projectId
 *
 * `run` answers with a run id unless `--wait`, which polls the durable status
 * until it is terminal and then returns the results envelope — preview,
 * artifacts and the managed-git revision the work landed in.
 */
import type { Command } from "commander";
import { resolve } from "node:path";
import pc from "picocolors";
import { action } from "../run.js";
import { api, sleep } from "../client.js";
import { ok, line, isJson } from "../output.js";
import { requireProject, type Context } from "../context.js";
import { WorkserError } from "../errors.js";

const AUTONOMY = new Set(["plan", "ask", "auto"]);
/** Statuses a caller should keep watching; everything else is an answer. */
const NON_TERMINAL = new Set([
  "starting",
  "running",
  "cancelling",
  "canceling",
  "queued",
  "pending",
  "in_progress",
  "planning",
  "unknown",
]);
const FAILED = new Set([
  "failed",
  "error",
  "cancelled",
  "canceled",
  "stopped",
  "declined",
]);

function cwdFor(ctx: Context, explicit: unknown): string {
  return resolve(ctx.cwd, String(explicit ?? ""));
}
function printRun(state: any): void {
  if (!state) return;
  line(`  run      ${pc.bold(state.runId ?? state.taskId ?? "?")}  ${state.status ?? ""}`);
  if (state.projectId) line(pc.dim(`  project  ${state.projectId}`));
  if (state.jobId) line(pc.dim(`  job      ${state.jobId}`));
}

function printResults(state: any): void {
  printRun(state);
  const preview = state?.preview;
  if (preview?.url) line(pc.cyan(`  preview  ${preview.url}`));
  const revision = state?.revision;
  if (revision) {
    line(
      pc.dim(
        `  git      ${revision.branch ?? "?"}@${revision.head?.slice(0, 10) ?? "?"}` +
          `${revision.dirty ? " (dirty)" : ""}`,
      ),
    );
  }
  for (const a of state?.artifacts ?? []) {
    line(`  artifact ${pc.bold(a.id ?? "")}  ${pc.dim(`[${a.kind ?? "file"}]`)} ${a.title ?? a.name ?? ""}`);
  }
}

export function registerCode(program: Command): void {
  const code = program
    .command("code")
    .description("Workser Code: submit a build to this project's coding agent and follow it");

  code
    .command("run <requirements>")
    .description("Submit requirements; prints the run id. Add --wait to follow it to the end")
    .option("--app <id>", "scope to one app (default: the app this folder belongs to)")
    .option("--cwd <dir>", "the workspace to build in (default: this folder)")
    .option("--autonomy <kind>", "plan (propose first) | ask | auto", "plan")
    .option("--model <model>", "model request for the coding agent")
    .option("--effort <effort>", "reasoning effort for the coding agent")
    .option("--agent <id>", "the coding agent to write it: claude, codex, cursor, opencode, copilot or workser_code (default: the project's main agent)")
    .option("--wait", "follow the run until it is no longer active, then return its results")
    .option("--timeout <seconds>", "how long --wait follows before giving up (default 1800)", "1800")
    .action(
      action(async ({ ctx, opts, args }) => {
        const projectId = requireProject(ctx);
        const autonomy = String(opts.autonomy ?? "plan");
        if (!AUTONOMY.has(autonomy)) {
          throw new WorkserError(
            `Unknown --autonomy "${autonomy}". Use one of: ${[...AUTONOMY].join(", ")}.`,
            { code: "bad_request" },
          );
        }
        const assignment = await api(ctx, "/v1/computer/code/runs", {
          body: {
            projectId,
            ...(opts.app ? { appId: String(opts.app) } : {}),
            requirements: String(args[0]),
            cwd: cwdFor(ctx, opts.cwd),
            autonomy,
            ...(opts.model && { model: String(opts.model) }),
            ...(opts.effort && { effort: String(opts.effort) }),
            ...(opts.agent && { agent: String(opts.agent) }),
          },
        });
        if (!opts.wait) {
          ok(assignment, () => printRun(assignment));
          return;
        }
        const final = await followRun(
          ctx,
          projectId,
          assignment?.runId,
          (Number(opts.timeout) || 1800) * 1000,
        );
        const results = await api(
          ctx,
          `/v1/computer/code/runs/${encodeURIComponent(final.runId)}/results`,
          { query: { projectId } },
        );
        ok(results, () => printResults(results));
        if (FAILED.has(String(final.status).toLowerCase())) process.exitCode = 1;
      }),
    );

  code
    .command("status <runId>")
    .description("Read a run's durable status (works after this CLI process is gone)")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const state = await api(
          ctx,
          `/v1/computer/code/runs/${encodeURIComponent(String(args[0]))}`,
          { query: { projectId } },
        );
        ok(state, () => printRun(state));
      }),
    );

  code
    .command("cancel <runId>")
    .description("Ask the daemon to stop a run; the durable task records the outcome")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const state = await api(
          ctx,
          `/v1/computer/code/runs/${encodeURIComponent(String(args[0]))}/cancel`,
          { body: { projectId } },
        );
        ok(state, () => {
          printRun(state);
          if (state?.status === "cancelling" || state?.status === "canceling") {
            line(pc.yellow("  cancelling — `workser code status` confirms when it stops."));
          }
        });
      }),
    );

  code
    .command("artifacts <runId>")
    .description("What the run produced: artifacts, preview and the git revision")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const results = await api(
          ctx,
          `/v1/computer/code/runs/${encodeURIComponent(String(args[0]))}/results`,
          { query: { projectId } },
        );
        ok(results, () => printResults(results));
      }),
    );
}

async function followRun(
  ctx: Context,
  projectId: string,
  runId: unknown,
  timeoutMs: number,
): Promise<{ runId: string; status: string }> {
  if (!runId || typeof runId !== "string") {
    throw new WorkserError("The capability did not return a run id.", {
      code: "bad_response",
    });
  }
  const deadline = Date.now() + timeoutMs;
  let last = "";
  for (;;) {
    const state = await api(
      ctx,
      `/v1/computer/code/runs/${encodeURIComponent(runId)}`,
      { query: { projectId } },
    );
    const status = String(state?.status ?? "unknown").toLowerCase();
    if (!isJson() && status !== last) {
      line(`  ${status}${state?.active ? pc.dim(" (active)") : ""}`);
      last = status;
    }
    if (!NON_TERMINAL.has(status)) return { runId, status };
    if (Date.now() > deadline) {
      return { runId, status };
    }
    await sleep(2500);
  }
}
