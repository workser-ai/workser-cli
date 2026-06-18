import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { ok, line } from "../output.js";

export function registerStatus(program: Command): void {
  program
    .command("status")
    .description("Show connection, current workspace/project, and latest deploy")
    .action(
      action(async ({ ctx }) => {
        const data = await api(ctx, "/v1/status", { query: { project: ctx.projectId } });
        ok(data, () => {
          line(pc.bold("Workser") + pc.dim(`  (${ctx.mode} · ${ctx.endpoint})`));
          line(`  user:      ${data.user?.email ?? "—"}`);
          line(`  workspace: ${data.workspace?.name ?? "—"}`);
          line(
            `  project:   ${data.project?.name ?? "—"}` +
              (data.project?.id ? pc.dim(`  (${data.project.id})`) : ""),
          );
          if (data.latestDeploy) {
            line(
              `  deploy:    ${colorStatus(data.latestDeploy.status)}` +
                (data.latestDeploy.url ? `  ${pc.cyan(data.latestDeploy.url)}` : ""),
            );
          }
        });
      }),
    );
}

export function colorStatus(s?: string): string {
  switch ((s ?? "").toLowerCase()) {
    case "ready":
    case "live":
    case "success":
      return pc.green(s!);
    case "error":
    case "failed":
    case "canceled":
      return pc.red(s!);
    case "building":
    case "queued":
    case "deploying":
      return pc.yellow(s!);
    default:
      return s ?? "—";
  }
}
