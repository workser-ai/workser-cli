import type { Command } from "commander";
import pc from "picocolors";

import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ok, line, success } from "../output.js";
import { WorkserError } from "../errors.js";
import { parseDeployEnvironment } from "../environments.js";
import { colorStatus } from "./status.js";

/**
 * `workser deployments` — the history, and the two verbs that change it.
 *
 * `deploy` starts a new build. This is everything else: what has been built,
 * what each one produced, and putting an older one back in front of customers.
 *
 * PROMOTE AND ROLLBACK ARE THE SAME UPSTREAM CALL, and they are deliberately
 * TWO commands here. Promote means "ship the newest build"; rollback means "put
 * version 7 back". Both are `POST /deployments/promote`, and collapsing them
 * into one command with an optional version is how someone rolls production
 * FORWARD while believing they rolled it back. The verb should say which
 * direction you are going.
 *
 * Both go through the daemon's `deploy.prod` gate — the same door
 * `deploy --prod` uses, which since Phase 5 is one that "just do it" cannot
 * open. There is no second, weaker way into production.
 *
 * NO `cancel`. The plan asks for one; core-api has no endpoint that stops a
 * running build, and a command that appears to cancel and does not is worse
 * than its absence. It stays a named gap rather than a stub.
 */
interface Deployment {
  id?: string;
  status?: string;
  environment?: string;
  version?: number;
  url?: string;
  vercel_url?: string;
  created_at?: string;
  webAppName?: string;
  web_app_id?: string;
  commit_sha?: string;
  error_message?: string;
}

export function registerDeployments(program: Command): void {
  const cmd = program
    .command("deployments")
    .description("Deployment history, and putting a build in front of customers");

  cmd
    .command("list")
    .description("What has been built, newest first")
    .option("--app <webAppId>", "just one app (default: every app in the project)")
    .option("--env <environment>", "preview or production")
    .option("--limit <n>", "how many to show", "20")
    .action(
      action(async ({ ctx, opts }) => {
        const projectId = requireProject(ctx);
        const environment = readEnv(opts.env, "deployments list");
        const res = await api(ctx, `/v1/projects/${projectId}/deployments`, {
          query: {
            ...(opts.app ? { webAppId: String(opts.app) } : {}),
            ...(environment ? { environment } : {}),
            limit: String(opts.limit ?? "20"),
          },
        });
        const items: Deployment[] = res?.deployments ?? [];
        ok(res, () => {
          if (!items.length) {
            return line(
              pc.dim(
                environment
                  ? `Nothing has been deployed to ${environment} yet.`
                  : "Nothing has been deployed yet. `workser deploy` builds the first one.",
              ),
            );
          }
          for (const d of items) line(formatDeployment(d));
        });
      }),
    );

  cmd
    .command("inspect <id>")
    .description("One deployment in full, with its build log")
    .option("--logs", "include the build output", false)
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const id = String(args[0]);
        const dep = await api(ctx, `/v1/deployments/${encodeURIComponent(id)}`);
        const logs = opts.logs
          ? await api(
              ctx,
              `/v1/projects/${projectId}/deployments/${encodeURIComponent(id)}/logs`,
            ).catch(() => null)
          : null;

        ok({ ...dep, logs }, () => {
          line(formatDeployment(dep));
          if (dep?.error_message) line(pc.red(`  ${dep.error_message}`));
          const events = logs?.events ?? [];
          for (const e of events) {
            line(`  ${pc.dim(String(e.type ?? "log"))}  ${e.text ?? ""}`);
          }
          if (opts.logs && !events.length) {
            line(pc.dim("  That build produced no output."));
          }
        });
      }),
    );

  cmd
    .command("promote")
    .description("Put the latest ready build in front of customers (asks you first)")
    .option("--app <webAppId>", "which app (defaults to the primary app)")
    .action(
      action(async ({ ctx, opts }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, `/v1/projects/${projectId}/deployments/promote`, {
          body: { ...(opts.app ? { webAppId: String(opts.app) } : {}) },
        });
        ok(res, () => printPromoted(res, null));
      }),
    );

  cmd
    .command("rollback <version>")
    .description("Put an earlier version back in front of customers (asks you first)")
    .option("--app <webAppId>", "which app (defaults to the primary app)")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const version = Number(args[0]);
        // A version is a number in this product, and `rollback abc123` is
        // someone reaching for a commit sha. Guessing which version that sha
        // belongs to would be a guess about what goes live.
        if (!Number.isInteger(version) || version < 1) {
          throw new WorkserError(
            `"${args[0]}" is not a version number. \`workser deployments list\` shows them.`,
            { code: "bad_input" },
          );
        }
        const res = await api(ctx, `/v1/projects/${projectId}/deployments/promote`, {
          body: {
            version,
            ...(opts.app ? { webAppId: String(opts.app) } : {}),
          },
        });
        ok(res, () => printPromoted(res, version));
      }),
    );
}

function readEnv(raw: unknown, verb: string): string | undefined {
  const parsed = parseDeployEnvironment(raw, verb);
  if (!parsed.ok) throw new WorkserError(parsed.error!, { code: "bad_input" });
  return parsed.value;
}

function printPromoted(res: Deployment | null, version: number | null): void {
  if (!res) return;
  const what = version === null ? "the latest build" : `version ${version}`;
  const url = res.url ?? res.vercel_url;
  // Deliberately not "it is live": promote STARTS a production build. Saying it
  // is live before Vercel has finished is a claim that is false for as long as
  // the build takes, which is exactly when someone is watching.
  success(`Production is being rebuilt from ${what}.`);
  if (url) line(pc.dim(`It will be at ${url}`));
  line(pc.dim("`workser deploy status` follows it."));
}

function formatDeployment(d: Deployment | null): string {
  if (!d) return "";
  const version = d.version !== undefined ? pc.yellow(`v${d.version}`) : pc.dim("v?");
  const env = pc.dim((d.environment ?? "?").padEnd(10));
  const app = d.webAppName ? `${d.webAppName}  ` : "";
  const when = pc.dim(formatTime(d.created_at));
  const url = d.url ? "  " + pc.cyan(d.url) : "";
  return `${version}  ${env} ${colorStatus(d.status ?? "")}  ${app}${when}${url}`;
}

function formatTime(t?: string): string {
  if (!t) return "—";
  const d = new Date(t);
  return Number.isNaN(d.getTime())
    ? String(t)
    : d.toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
}
