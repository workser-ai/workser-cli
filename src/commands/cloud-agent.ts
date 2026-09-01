import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { ok, line, warn } from "../output.js";

/**
 * `workser cloud-agent` — agents that run on Workser's infrastructure and can
 * be called from the apps in this project.
 *
 * ===========================================================================
 * THIS IS NOT `workser agent`
 * ===========================================================================
 * `workser agent` delegates a subtask to a coding agent on THIS machine —
 * Claude Code, Codex, Kimi, opencode. It is how the main agent hands work to a
 * teammate while it keeps building.
 *
 * `workser cloud-agent` creates and runs an agent that lives in the cloud,
 * keeps its own memory and tools, and can be reached from the customer's
 * deployed web, mobile, API or Python app. It is a thing the project SHIPS,
 * not a thing that helps build it.
 *
 * The two are named apart because they were nearly named the same: the daemon
 * and core-api both expose a `/v1/agents`, meaning these two different
 * products. A CLI that blurred them would make that permanent.
 *
 *   GET    /v1/cloud-agents                     list
 *   POST   /v1/cloud-agents                     create
 *   GET    /v1/cloud-agents/:id                 show
 *   POST   /v1/cloud-agents/:id/runs            run
 *   GET    /v1/cloud-agents/:id/runs            recent runs
 *   GET    /v1/cloud-agents/runs/:runId         one run, with what it cost
 *
 * Every call is scoped to the project pinned to the working directory, by the
 * daemon rather than by anything passed here — so an agent running in one
 * project's folder cannot reach another project's agents even if it tries.
 */
export function registerCloudAgent(program: Command): void {
  const cloud = program
    .command("cloud-agent")
    .description(
      "Agents that run in the cloud and can be called from this project's apps (not the local coding agents — that's `workser agent`)",
    );

  cloud
    .command("list")
    .description("List this project's cloud agents")
    .action(
      action(async ({ ctx }) => {
        const res = await api(ctx, "/v1/cloud-agents");
        const agents = res?.agents ?? res ?? [];
        ok(res, () => {
          if (!agents.length) {
            line(pc.dim("No cloud agents yet."));
            line(
              pc.dim("Create one: ") +
                pc.bold('workser cloud-agent create "Order desk" --instructions "..."'),
            );
            return;
          }
          for (const a of agents) {
            line(
              `${pc.bold(a.name ?? a.id)}  ${pc.dim(a.id)}` +
                (a.status ? `  ${pc.dim(a.status)}` : ""),
            );
            if (a.description) line("  " + pc.dim(a.description));
          }
        });
      }),
    );

  cloud
    .command("create <name>")
    .description("Create a cloud agent in this project")
    .option("--description <text>", "What it is for, in the owner's words")
    .option(
      "--instructions <text>",
      "The agent's standing instructions — what it should always do",
    )
    .action(
      action(async ({ ctx, args, opts }) => {
        const res = await api(ctx, "/v1/cloud-agents", {
          method: "POST",
          body: {
            name: args[0],
            description: opts.description,
            instructions: opts.instructions,
          },
        });
        ok(res, () => {
          line(pc.green("Created ") + pc.bold(res?.name ?? args[0]));
          if (res?.id) line(pc.dim(res.id));
          line("");
          line(
            pc.dim("Give it work: ") +
              pc.bold(`workser cloud-agent run ${res?.id ?? "<id>"} "..."`),
          );
        });
      }),
    );

  cloud
    .command("show <agentId>")
    .description("One cloud agent, with its configuration")
    .action(
      action(async ({ ctx, args }) => {
        const res = await api(ctx, `/v1/cloud-agents/${encodeURIComponent(args[0])}`);
        ok(res, () => {
          line(pc.bold(res?.name ?? args[0]));
          if (res?.description) line(pc.dim(res.description));
          if (res?.instructions) {
            line("");
            line(pc.bold("instructions:"));
            line(res.instructions);
          }
        });
      }),
    );

  cloud
    .command("run <agentId> <message>")
    .description("Give a cloud agent something to do")
    .action(
      action(async ({ ctx, args }) => {
        const res = await api(
          ctx,
          `/v1/cloud-agents/${encodeURIComponent(args[0])}/runs`,
          { method: "POST", body: { input: { message: args[1] } } },
        );
        ok(res, () => {
          line(pc.green("Started run ") + pc.bold(res?.id ?? ""));
          // Runs are asynchronous by design — the agent may work for minutes.
          // Telling the caller how to follow it is the difference between an
          // async API and one that looks broken.
          line(
            pc.dim("Follow it: ") +
              pc.bold(`workser cloud-agent runs ${res?.id ?? "<runId>"}`),
          );
        });
      }),
    );

  cloud
    .command("runs [agentIdOrRunId]")
    .description("Recent runs for an agent, or one run in detail")
    .option("--limit <n>", "How many to list", "10")
    .action(
      action(async ({ ctx, args, opts }) => {
        const id = args[0];
        if (!id) {
          warn("Give an agent id to list its runs, or a run id to inspect one.");
          return;
        }
        // A run id and an agent id are both opaque, so which endpoint to call
        // cannot be decided from the string. Ask for the run first — the
        // narrower answer — and fall back to listing the agent's runs. The
        // alternative, a `--run` flag, makes the common case wordier to spare
        // one request in the uncommon one.
        try {
          const run = await api(
            ctx,
            `/v1/cloud-agents/runs/${encodeURIComponent(id)}`,
          );
          ok(run, () => printRun(run));
          return;
        } catch {
          // Not a run id. Treat it as an agent id.
        }
        const res = await api(
          ctx,
          `/v1/cloud-agents/${encodeURIComponent(id)}/runs`,
          { query: { limit: opts.limit } },
        );
        const runs = res?.runs ?? res ?? [];
        ok(res, () => {
          if (!runs.length) {
            line(pc.dim("No runs yet."));
            return;
          }
          for (const r of runs) printRun(r, true);
        });
      }),
    );
}

/**
 * One run, with its cost.
 *
 * Cost is printed on purpose and not behind a flag. Agent Cloud is metered per
 * minute, and the fastest way to lose a customer's trust in a meter is to make
 * them go somewhere else to find out what a thing cost.
 */
function printRun(run: any, compact = false): void {
  const status = String(run?.status ?? "").toLowerCase();
  const colour =
    status === "completed" ? pc.green : status === "failed" ? pc.red : pc.yellow;
  line(
    `${colour(status || "unknown")}  ${pc.bold(run?.id ?? "")}` +
      (run?.duration_ms ? `  ${pc.dim(formatDuration(run.duration_ms))}` : ""),
  );
  // The COMPLETE cost when the detail read supplied one. `cost_usd` alone is
  // the model spend; the minutes the run held are metered separately, so
  // printing only that answers "what did this cost" with a number that is
  // always too low. See `RunDetailResponseDto.cost_breakdown`.
  const breakdown = run?.cost_breakdown;
  if (breakdown) {
    if (!breakdown.settled) {
      line("  " + pc.dim("cost: still being worked out"));
    } else {
      line("  " + pc.dim(`cost: $${Number(breakdown.total_usd).toFixed(4)}`));
      line(
        "    " +
          pc.dim(
            `model $${Number(breakdown.model_usd).toFixed(4)} · ` +
              `infrastructure $${Number(breakdown.infrastructure_usd).toFixed(4)}`,
          ),
      );
    }
  } else if (run?.cost_usd !== undefined && run?.cost_usd !== null) {
    // A list row, which carries no breakdown. Labelled for what it is rather
    // than passed off as the total.
    line("  " + pc.dim(`model cost: $${Number(run.cost_usd).toFixed(4)}`));
  }
  if (!compact && run?.output) {
    line("");
    line(typeof run.output === "string" ? run.output : JSON.stringify(run.output, null, 2));
  }
  if (run?.error?.message) line("  " + pc.red(run.error.message));
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}
