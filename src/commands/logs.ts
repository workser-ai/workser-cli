import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api, sleep } from "../client.js";
import { requireProject } from "../context.js";
import { ok, line, isJson } from "../output.js";
import { parseDeployEnvironment } from "../environments.js";
import { WorkserError } from "../errors.js";

/**
 * `workser logs` — the build output of one deployment.
 *
 * TWO FLAGS THAT CHANGE WHAT THE ANSWER IS ABOUT. A project holds several apps
 * and each app has two environments, and until 2026-08-20 this command silently
 * meant "the newest deployment of the primary app". An operator asking whether
 * production is broken was being shown a preview build, with nothing on screen
 * saying so.
 *
 * The response now names the deployment it read, and says why the list is empty
 * when it is — "nothing has been deployed to production yet" is a different
 * thing to do next than "the build printed nothing", and an empty array meant
 * both.
 */
export function registerLogs(program: Command): void {
  program
    .command("logs")
    .description("Show the build logs of the latest deployment")
    .option("-n, --lines <n>", "number of lines", "100")
    .option("-f, --follow", "keep streaming new logs", false)
    .option("--app <webAppId>", "which app (defaults to the primary app)")
    .option("--env <environment>", "preview or production (default: whichever deployed last)")
    .action(
      action(async ({ ctx, opts }) => {
        const projectId = requireProject(ctx);
        const parsed = parseDeployEnvironment(opts.env, "logs");
        if (!parsed.ok) {
          throw new WorkserError(parsed.error!, { code: "bad_input" });
        }
        const scope = {
          ...(opts.app ? { webAppId: String(opts.app) } : {}),
          ...(parsed.value ? { environment: parsed.value } : {}),
        };

        const first = await api(ctx, `/v1/projects/${projectId}/logs`, {
          query: { lines: opts.lines, ...scope },
        });
        ok(first, () => print(first));

        if (opts.follow && !isJson()) {
          let cursor = first.cursor;
          for (;;) {
            await sleep(2000);
            const next = await api(ctx, `/v1/projects/${projectId}/logs`, {
              query: { after: cursor, ...scope },
            });
            (next.entries ?? []).forEach((e: any) => line(formatLog(e)));
            if (next.cursor) cursor = next.cursor;
          }
        }
      }),
    );
}

function print(res: any): void {
  const entries = res?.entries ?? [];
  for (const e of entries) line(formatLog(e));
  // The note is the whole point of the change: it is the difference between
  // "there is nothing wrong" and "you are looking at the wrong thing".
  if (!entries.length && res?.note) line(pc.dim(res.note));
  if (entries.length && res?.deploymentId) {
    const where = res.environment ? ` (${res.environment})` : "";
    line(pc.dim(`— build ${res.deploymentId}${where}`));
  }
}

function formatLog(e: any): string {
  if (typeof e === "string") return e;
  return `${e.ts ?? ""} ${e.level ? `[${e.level}] ` : ""}${e.message ?? ""}`.trim();
}
