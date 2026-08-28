import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { appTarget } from "../context.js";
import { ok, success, line } from "../output.js";
import { WorkserError } from "../errors.js";

/**
 * `workser key` — Workser-managed credentials for an app (AI_GATEWAY_API_KEY,
 * BETTER_AUTH_SECRET), listed and rotated the way any cloud provider's API
 * keys are: a redacted list you can check, and a rotate that shows the new
 * secret exactly once.
 *
 * Deliberately app-scoped, not project-scoped — unlike `workser env`, which
 * defaults to the project's primary app when `--app` is omitted, these
 * routes need an app you actually mean: rotating the wrong app's production
 * key is not a mistake a default should make easy.
 */

function requireApp(ctx: any, explicit?: string): string {
  const appId = appTarget(ctx, explicit);
  if (!appId) {
    throw new WorkserError(
      "No app to target.\n" +
        "\n  • Run this from the app's own folder (its ID is picked up automatically), or" +
        "\n  • pass --app <webAppId> — `workser project show` lists an app's ID.",
      { code: "no_app" },
    );
  }
  return appId;
}

export function registerKey(program: Command): void {
  const key = program
    .command("key")
    .description("Manage this app's Workser-issued credentials (AI Gateway, auth secret)");

  key
    .command("list")
    .description("List this app's managed keys (redacted — never the secret)")
    .option("--app <webAppId>", "Which app (default: the one this folder is linked to)")
    .action(
      action(async ({ ctx, opts }) => {
        const appId = requireApp(ctx, opts.app);
        const items: Array<{
          environment: string;
          prefix: string;
          created_at: string;
          last_used_at?: string;
        }> = await api(ctx, `/v1/apps/${appId}/keys`);
        ok(items, () => {
          if (!items?.length) {
            return line(pc.dim("No managed keys yet — they're created the first time this app deploys."));
          }
          for (const item of items) {
            const lastUsed = item.last_used_at
              ? `last used ${item.last_used_at}`
              : "never used yet";
            line(`${pc.bold(item.environment)}  ${item.prefix}…  ${pc.dim(`(${lastUsed})`)}`);
          }
        });
      }),
    );

  key
    .command("rotate <key>")
    .description("Rotate a managed key (AI_GATEWAY_API_KEY, BETTER_AUTH_SECRET)")
    .option("--app <webAppId>", "Which app (default: the one this folder is linked to)")
    .option("--env <environment>", "production or preview — required for AI_GATEWAY_API_KEY")
    .action(
      action(async ({ ctx, args, opts }) => {
        const appId = requireApp(ctx, opts.app);
        const keyName = args[0] as string;
        const environment = typeof opts.env === "string" ? opts.env : undefined;
        if (environment && environment !== "production" && environment !== "preview") {
          throw new WorkserError(
            `--env must be "production" or "preview", got "${environment}".`,
            { code: "bad_input" },
          );
        }

        const res = await api(
          ctx,
          `/v1/apps/${appId}/keys/${encodeURIComponent(keyName)}/rotate`,
          { body: { environment } },
        );

        ok(res, () => {
          success(`Rotated ${pc.bold(keyName)}${res?.environment ? ` (${res.environment})` : ""}.`);
          if (res?.key) {
            line("");
            line(pc.bold("New value — shown once, not stored anywhere in the clear:"));
            line(pc.yellow(res.key));
          }
          line("");
          line(
            pc.dim(
              "The old value stopped working immediately. If this app is already deployed, " +
                "redeploy so it picks up the new one: workser deploy" +
                (res?.environment === "production" ? " --prod" : ""),
            ),
          );
        });
      }),
    );
}
