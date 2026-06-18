import type { Command } from "commander";
import { action } from "../run.js";
import { api, sleep } from "../client.js";
import { requireProject } from "../context.js";
import { ok, line, isJson } from "../output.js";

export function registerLogs(program: Command): void {
  program
    .command("logs")
    .description("Show recent logs for the project's app")
    .option("-n, --lines <n>", "number of lines", "100")
    .option("-f, --follow", "keep streaming new logs", false)
    .action(
      action(async ({ ctx, opts }) => {
        const projectId = requireProject(ctx);
        const first = await api(ctx, `/v1/projects/${projectId}/logs`, {
          query: { lines: opts.lines },
        });
        ok(first, () => (first.entries ?? []).forEach((e: any) => line(formatLog(e))));

        if (opts.follow && !isJson()) {
          let cursor = first.cursor;
          for (;;) {
            await sleep(2000);
            const next = await api(ctx, `/v1/projects/${projectId}/logs`, { query: { after: cursor } });
            (next.entries ?? []).forEach((e: any) => line(formatLog(e)));
            if (next.cursor) cursor = next.cursor;
          }
        }
      }),
    );
}

function formatLog(e: any): string {
  if (typeof e === "string") return e;
  return `${e.ts ?? ""} ${e.level ? `[${e.level}] ` : ""}${e.message ?? ""}`.trim();
}
