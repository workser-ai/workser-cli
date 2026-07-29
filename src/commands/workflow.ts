import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ok, line } from "../output.js";

/**
 * Workflow Automation for the local agent — the same event-driven, multi-step
 * automation engine the cloud AI agent and the human-facing web Workflow tab
 * already use. Node/connection/trigger authoring is left to a JSON body
 * (`--body`) rather than a flag-per-field CLI, since that graph shape is rich
 * and best produced by the agent itself.
 */
export function registerWorkflow(program: Command): void {
  const wf = program
    .command("workflow")
    .description("Create, run, and inspect workflow automations for the project");

  wf
    .command("list")
    .description("List the project's workflows")
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const items = await api(ctx, `/v1/projects/${projectId}/workflows`);
        ok(items, () => {
          if (!items?.length) return line(pc.dim("No workflows yet. `workser workflow create`."));
          for (const w of items) {
            const status = w.is_active ? pc.green("active") : pc.dim("inactive");
            line(`${w.id}  ${pc.bold(w.name ?? "Untitled")}  ${status}`);
          }
        });
      }),
    );

  wf
    .command("create <name>")
    .description("Create a workflow (pass --body for nodes/connections/triggers)")
    .option("--body <payload>", "full workflow payload as a JSON string")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const extra = opts.body ? JSON.parse(opts.body) : {};
        const res = await api(ctx, `/v1/projects/${projectId}/workflows`, {
          body: { name: args[0], ...extra },
        });
        ok(res, () => line(`Created workflow ${pc.bold(res.id)}.`));
      }),
    );

  wf
    .command("get <id>")
    .description("Show a workflow's full definition")
    .action(
      action(async ({ ctx, args }) => {
        const res = await api(ctx, `/v1/workflows/${args[0]}`, { query: { includeDetails: "true" } });
        ok(res, () => line(JSON.stringify(res, null, 2)));
      }),
    );

  wf
    .command("activate <id>")
    .description("Activate a workflow")
    .action(
      action(async ({ ctx, args }) => {
        const res = await api(ctx, `/v1/workflows/${args[0]}/activate`, { body: {} });
        ok(res, () => line("Activated."));
      }),
    );

  wf
    .command("deactivate <id>")
    .description("Deactivate a workflow")
    .action(
      action(async ({ ctx, args }) => {
        const res = await api(ctx, `/v1/workflows/${args[0]}/deactivate`, { body: {} });
        ok(res, () => line("Deactivated."));
      }),
    );

  wf
    .command("run <id>")
    .description("Run a workflow now")
    .option("--wait", "block until the run completes", false)
    .option("--body <input>", "input payload as a JSON string")
    .action(
      action(async ({ ctx, args, opts }) => {
        const input = opts.body ? JSON.parse(opts.body) : {};
        const res = await api(ctx, `/v1/workflows/${args[0]}/execute`, {
          query: { wait: opts.wait ? "true" : "false" },
          body: input,
        });
        ok(res, () => line(JSON.stringify(res, null, 2)));
      }),
    );

  wf
    .command("runs <id>")
    .description("List past executions of a workflow")
    .action(
      action(async ({ ctx, args }) => {
        const items = await api(ctx, `/v1/workflows/${args[0]}/executions`);
        ok(items, () => {
          if (!items?.length) return line(pc.dim("No runs yet."));
          for (const e of items) line(`${e.id}  ${e.status ?? ""}  ${pc.dim(e.started_at ?? "")}`);
        });
      }),
    );

  wf
    .command("nodes [query]")
    .description("Search the workflow node-type catalog")
    .action(
      action(async ({ ctx, args }) => {
        const items = await api(ctx, `/v1/node-types`, { query: { q: args[0] } });
        ok(items, () => {
          if (!items?.length) return line(pc.dim("No matching node types."));
          for (const n of items) line(`${n.name ?? n.type}  ${pc.dim(n.category ?? "")}`);
        });
      }),
    );
}
