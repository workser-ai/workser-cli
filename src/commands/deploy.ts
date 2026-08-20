import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api, sleep } from "../client.js";
import { requireProject, requireLocalApp, type Context } from "../context.js";
import { ok, success, line, isJson } from "../output.js";
import { parseDeployEnvironment } from "../environments.js";
import { WorkserError } from "../errors.js";
import { colorStatus } from "./status.js";

const TERMINAL = new Set(["ready", "live", "success", "error", "failed", "canceled"]);

export function registerDeploy(program: Command): void {
  const deploy = program
    .command("deploy")
    .description("Deploy the current project to Workser (git → Vercel) and return a live URL")
    .option("--prod", "deploy to production (same as --env production)", false)
    .option(
      "--env <environment>",
      "which environment to deploy: preview (default) or production",
    )
    .option("--watch", "wait for the deploy to finish, streaming status", false)
    .option(
      "--app <webAppId>",
      "which app to publish (default: the app this folder is linked to)",
    )
    .action(
      action(async ({ ctx, opts }) => {
        // Deploy publishes THIS FOLDER: the daemon commits the cwd, bundles it
        // and uploads the bundle. On a machine with only the CLI and a token
        // there is no daemon and no folder, and this used to answer `Cannot
        // POST /v1/projects/<id>/deploy` — a raw 404 that reads like Workser is
        // down rather than like "this computer doesn't have your code".
        requireLocalApp(ctx, "deploy");
        const projectId = requireProject(ctx);

        // `--prod` and `--env production` are the same request. `--prod` is
        // kept, not deprecated: it is in every script and every agent prompt
        // written before today, and breaking those to gain one spelling would
        // be a change with no benefit to anyone.
        //
        // Disagreement is refused rather than resolved. `--prod --env preview`
        // is somebody who believes one of the two things they typed, and
        // picking one for them means half the time we ship to the environment
        // they were trying to avoid.
        const parsedEnv = parseDeployEnvironment(opts.env, "deploy");
        if (!parsedEnv.ok) {
          throw new WorkserError(parsedEnv.error!, { code: "bad_input" });
        }
        if (opts.prod && parsedEnv.value === "preview") {
          throw new WorkserError(
            "`--prod` and `--env preview` ask for different things. Pass one.",
            { code: "bad_input" },
          );
        }
        const prod = Boolean(opts.prod) || parsedEnv.value === "production";
        // `--app` is rarely needed: the daemon resolves the app from the folder
        // being deployed, which is the same question. It matters when one folder
        // is linked to nothing, or when deploying from outside a linked folder.
        const dep = await api(ctx, `/v1/projects/${projectId}/deploy`, {
          body: {
            prod,
            cwd: ctx.cwd,
            ...(opts.app ? { webAppId: opts.app } : {}),
          },
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
