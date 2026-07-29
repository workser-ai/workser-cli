import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { ok, line, warn } from "../output.js";

/**
 * `workser agent` — let the main agent delegate focused subtasks to the user's
 * configured roles (e.g. qa → codex, designer → claude_code). Each role runs as
 * an isolated local subagent (its own context), keeping the main agent lean.
 *
 *   GET  /v1/agents          -> { mainAgent, roles: (Role & {installed, authed})[] }
 *   POST /v1/agents/run      { role, task } -> { role, agent, output, exitCode, durationMs }
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
          if (!roles.length) return line(pc.dim("No subagents configured. Add them in the Workser Orbit Agents screen."));
          line(pc.bold("subagents:"));
          for (const r of roles) line("  " + formatRole(r));
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
