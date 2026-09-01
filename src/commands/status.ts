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
        // The folder half is answered locally and merged in, so `--json` callers
        // get one object rather than having to ask twice. It is also the half
        // that answers the question people actually run `status` for once the
        // project is a tree: "which project and app is this shell in?"
        const merged = {
          ...data,
          folder: {
            cwd: ctx.cwd,
            projectRoot: ctx.projectRoot ?? null,
            appId: ctx.appId ?? null,
            appName: ctx.appName ?? null,
          },
        };
        ok(merged, () => {
          line(pc.bold("Workser") + pc.dim(`  (${ctx.mode} · ${ctx.endpoint})`));
          line(`  user:      ${data.user?.email ?? "—"}`);
          line(`  workspace: ${data.workspace?.name ?? "—"}`);
          line(
            `  project:   ${data.project?.name ?? "—"}` +
              (data.project?.id ? pc.dim(`  (${data.project.id})`) : ""),
          );
          if (ctx.projectRoot) line(`  folder:    ${pc.dim(ctx.projectRoot)}`);
          /**
           * WHERE this shell may work, and what established it.
           *
           * `status` is what someone runs after work landed in the wrong place,
           * and the answer is almost always here: "folder" means this directory
           * decided, "workser" means the app's current selection did — so
           * opening a different project moves it, and a shell in an unmarked
           * folder follows along.
           *
           * The ORG is the line that matters, so it is what gets printed. Its
           * projects are all reachable; another organization's are not.
           */
          if (data.scope) {
            const why =
              data.scope.source === "folder"
                ? "this folder"
                : data.scope.source === "active"
                  ? "the project open in Workser"
                  : null;
            line(
              data.scope.orgId
                ? `  org:       ${data.scope.orgId}` +
                    (why ? pc.dim(`  (from ${why})`) : "")
                : `  org:       ${pc.yellow("unscoped — every project is reachable")}`,
            );
          }
          // Named only when we are inside one. Printing "app: —" from the
          // project folder would read as a fault; it is the normal place to
          // stand for anything that spans more than one app.
          if (ctx.appId) {
            line(
              `  app:       ${ctx.appName ?? "—"}` + pc.dim(`  (${ctx.appId})`),
            );
          }
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
