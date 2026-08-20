import type { Command } from "commander";
import pc from "picocolors";

import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ok, line, success } from "../output.js";
import { urlRows, urlsSummary, type AppUrls } from "../environments.js";

/**
 * `workser urls` — where every app in this project actually lives.
 *
 * WHY THIS IS A COMMAND AND NOT SOMETHING YOU READ OFF A DEPLOY RESPONSE. A
 * deploy answers with the host that build landed on: `abc123-xyz.vercel.app`,
 * which the NEXT deploy retires. Handing that to someone as "your preview
 * address" is exactly how "the preview URL changes every time I deploy" became
 * a support question. This command reads the STABLE hosts only, and it does not
 * fall back to the ephemeral ones — a fallback is how the wrong URL gets used
 * on precisely the day it matters.
 *
 * An app with no URL yet prints WHY, and the command to fix it. A blank column
 * would read as "it broke" when it means "you have not published this yet".
 */
export function registerUrls(program: Command): void {
  program
    .command("urls")
    .description("The stable preview and production addresses of every app in this project")
    .option("--app <webAppId>", "just one app")
    .action(
      action(async ({ ctx, opts }) => {
        const projectId = requireProject(ctx);
        const apps = (await api(ctx, `/v1/apps`, {
          query: { project: projectId },
        })) as AppUrls[] | { apps?: AppUrls[] };

        const list = Array.isArray(apps) ? apps : (apps?.apps ?? []);
        const wanted = opts.app
          ? list.filter((a) => a.id === String(opts.app))
          : list;
        const rows = urlRows(wanted);
        const summary = urlsSummary(rows);

        ok({ rows, summary }, () => {
          for (const row of rows) {
            const label = pc.dim(row.environment.padEnd(10));
            const value = row.url
              ? pc.cyan(row.url)
              : pc.dim(row.note ?? "not published");
            line(`  ${row.appName.padEnd(22)} ${label} ${value}`);
          }
          line("");
          if (rows.some((r) => r.url)) success(summary);
          else line(pc.yellow(summary));
        });
      }),
    );
}
