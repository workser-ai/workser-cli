import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api, sleep } from "../client.js";
import { requireProject, type Context } from "../context.js";
import { ok, success, line, isJson } from "../output.js";
import { colorStatus } from "./status.js";

const TERMINAL = new Set(["ready", "live", "success", "error", "failed", "canceled"]);

export function registerDeploy(program: Command): void {
  const deploy = program
    .command("deploy")
    .description("Deploy the current project to Workser (git → Vercel) and return a live URL")
    .option("--prod", "deploy to production", false)
    .option("--watch", "wait for the deploy to finish, streaming status", false)
    .action(
      action(async ({ ctx, opts }) => {
        const projectId = requireProject(ctx);
        const dep = await api(ctx, `/v1/projects/${projectId}/deploy`, {
          body: { prod: Boolean(opts.prod), cwd: ctx.cwd },
        });

        if (opts.watch && dep?.id) {
          const final = await watchDeploy(ctx, dep.id);
          return ok(final, () => printDeploy(final));
        }
        ok(dep, () => printDeploy(dep));
      }),
    );

  deploy
    .command("status [id]")
    .description("Show a deploy's status (defaults to the latest)")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const dep = args[0]
          ? await api(ctx, `/v1/deployments/${encodeURIComponent(args[0])}`)
          : await api(ctx, `/v1/projects/${projectId}/deployments/latest`);
        ok(dep, () => printDeploy(dep));
      }),
    );
}

async function watchDeploy(ctx: Context, id: string): Promise<any> {
  let last = "";
  for (;;) {
    const dep = await api(ctx, `/v1/deployments/${encodeURIComponent(id)}`);
    if (!isJson() && dep.status !== last) {
      line(`  ${colorStatus(dep.status)}${dep.url ? "  " + pc.cyan(dep.url) : ""}`);
      last = dep.status;
    }
    if (TERMINAL.has(String(dep.status).toLowerCase())) return dep;
    await sleep(2500);
  }
}

function printDeploy(dep: any): void {
  if (!dep) return;
  const ready = ["ready", "live", "success"].includes(String(dep.status).toLowerCase());
  if (ready && dep.url) success(`Live at ${pc.cyan(dep.url)}`);
  else line(`deploy ${colorStatus(dep.status)} ${pc.dim(`(${dep.id ?? "?"})`)}${dep.url ? "  " + dep.url : ""}`);
}
