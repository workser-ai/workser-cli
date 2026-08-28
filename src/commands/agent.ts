import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { assertDelegatableModel } from "../model-policy.js";
import { api } from "../client.js";
import { ok, line, warn } from "../output.js";

/** Contract agent ids `agent spawn` accepts. */
const SPAWNABLE_AGENTS = ["claude_code", "codex", "kimi", "opencode", "grok"];

/**
 * `workser agent` — let the main agent delegate focused subtasks either to the
 * user's configured roles (e.g. qa → codex, designer → claude_code) or, via
 * `spawn`, to an ad-hoc teammate on any connected agent CLI. Each subagent
 * runs isolated (its own context/process), keeping the main agent lean.
 *
 *   GET  /v1/agents          -> { mainAgent, roles: (Role & {installed, authed})[], detected }
 *   POST /v1/agents/run      { role, task } -> { role, agent, output, exitCode, durationMs }
 *   POST /v1/agents/run      { role?, task, agent, model?, instructions?, effort? } (ad-hoc)
 */
export function registerAgent(program: Command): void {
  const agent = program
    .command("agent")
    .description("Delegate focused subtasks to your configured agent roles (each runs isolated)");

  agent
    .command("list")
    .description("List the main agent (+ backup) and the configured subagents")
    .action(
      action(async ({ ctx }) => {
        const cfg = await api(ctx, "/v1/agents");
        ok(cfg, () => {
          line(pc.bold("main agent:") + " " + (cfg?.mainAgent ?? pc.dim("none")));
          line(pc.bold("backup agent:") + " " + (cfg?.backupAgent ?? pc.dim("none")));
          // Surface automatic failover when the backup is what would actually run.
          if (
            cfg?.effectiveMainAgent &&
            cfg.effectiveMainAgent !== cfg.mainAgent
          ) {
            line(
              pc.yellow(
                `  ⤷ failover active: runs use ${cfg.effectiveMainAgent} (main not available)`,
              ),
            );
          }
          const roles = cfg?.roles ?? [];
          if (!roles.length) {
            line(pc.dim("No subagents configured. Add them in the Workser Orbit Agents screen."));
          } else {
            line(pc.bold("subagents:"));
            for (const r of roles) line("  " + formatRole(r));
          }
          const detected = cfg?.detected ?? [];
          const spawnable = detected.filter(
            (d: any) => d?.installed && d?.authed !== false,
          );
          line(
            pc.bold("spawnable (workser agent spawn <agent>):") +
              " " +
              (spawnable.length
                ? spawnable.map((d: any) => toContractId(d.id)).join(", ")
                : pc.dim("none connected")),
          );
        });
      }),
    );

  agent
    .command("main")
    .description("Show the configured main agent and its backup")
    .action(
      action(async ({ ctx }) => {
        const cfg = await api(ctx, "/v1/agents");
        ok(
          {
            mainAgent: cfg?.mainAgent ?? null,
            backupAgent: cfg?.backupAgent ?? null,
          },
          () => {
            line(pc.bold("main agent:") + " " + (cfg?.mainAgent ?? pc.dim("none")));
            line(pc.bold("backup agent:") + " " + (cfg?.backupAgent ?? pc.dim("none")));
          },
        );
      }),
    );

  agent
    .command("run <role> <task...>")
    .description("Run a subagent locally on a focused task; prints its output")
    .action(
      action(async ({ ctx, args }) => {
        const role = args[0] as string;
        const task = (args[1] as string[]).join(" ");
        const res = await api(ctx, "/v1/agents/run", { body: { role, task } });
        const exitCode = res?.exitCode ?? 0;
        ok(res, () => {
          if (res?.output) line(res.output);
          if (exitCode !== 0) {
            warn(`Role "${role}" (${res?.agent ?? "?"}) exited with code ${exitCode}.`);
          }
        });
        // Reflect a non-zero subagent exit in the CLI's own exit code.
        if (exitCode !== 0) process.exitCode = exitCode;
      }),
    );

  agent
    .command("spawn <agent> <task...>")
    .description(
      `Spin up a TEMPORARY teammate on any connected agent CLI (not a saved role) for a one-off task. <agent>: ${SPAWNABLE_AGENTS.join("|")}`,
    )
    .option("--role <label>", "display label for this run (default: <agent>)")
    .option(
      "--instructions <text>",
      "system prompt for this one run — this teammate's expertise/scope",
    )
    .option("--model <model>", "model override for the backing CLI")
    .option("--effort <level>", "reasoning effort, where the backing CLI supports it")
    .option(
      "--read-only",
      "inspection only — the teammate runs in the CLI's read-only sandbox and cannot change anything",
    )
    .action(
      action(async ({ ctx, args, opts }) => {
        const spawnAgent = args[0] as string;
        const task = (args[1] as string[]).join(" ");
        // One agent standing up another is the definition of an unattended
        // choice — see `model-policy.ts`. The daemon refuses it too; this is
        // the half that fails before a process is spawned.
        assertDelegatableModel("--model", opts.model);
        const res = await api(ctx, "/v1/agents/run", {
          body: {
            agent: spawnAgent,
            task,
            role: opts.role,
            instructions: opts.instructions,
            model: opts.model,
            effort: opts.effort,
            // Enforced by the backing CLI's own sandbox, not by asking the
            // spawned agent to behave — see the daemon's `/agents/run`.
            readOnly: opts.readOnly === true,
          },
        });
        const exitCode = res?.exitCode ?? 0;
        ok(res, () => {
          if (res?.output) line(res.output);
          if (exitCode !== 0) {
            warn(`Spawned ${spawnAgent} exited with code ${exitCode}.`);
          }
        });
        if (exitCode !== 0) process.exitCode = exitCode;
      }),
    );
}

/** Detector short id -> contract id, mirroring the daemon's `toRoleAgent`. */
function toContractId(id: string): string {
  return id === "claude" ? "claude_code" : id;
}

function formatRole(r: any): string {
  const label = pc.yellow(r.role);
  const agent = pc.dim("· " + (r.agent ?? "?"));
  const enabled = r.enabled === false ? pc.red("disabled") : pc.green("enabled");
  const runnable = r.installed && r.authed !== false;
  const ready = runnable ? pc.green("runnable") : pc.dim("not runnable");
  const extras: string[] = [];
  if (r.model) extras.push(`model ${r.model}`);
  if (Array.isArray(r.apps) && r.apps.length) extras.push(`apps: ${r.apps.join(",")}`);
  if (Array.isArray(r.mcp) && r.mcp.length) extras.push(`mcp: ${r.mcp.length}`);
  const tail = extras.length ? "  " + pc.dim(extras.join(" · ")) : "";
  return `${label}  ${agent}  ${enabled}  ${ready}${tail}`;
}
