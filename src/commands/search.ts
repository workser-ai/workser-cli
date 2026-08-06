import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { ok, line } from "../output.js";

/**
 * Google-grounded web search, server-side (core-api holds the API key — the
 * daemon/CLI never see it). Not project-scoped: it's a general research tool,
 * the local counterpart to the `search-tools.ts` grounded search the cloud
 * TPM fleet already has.
 */
export function registerSearch(program: Command): void {
  program
    .command("search <query>")
    .description("Search the web (Google-grounded, server-side)")
    .option("-n, --max-results <n>", "max results", "5")
    .action(
      action(async ({ ctx, args, opts }) => {
        const res = await api(ctx, "/v1/search", {
          query: { q: args[0], maxResults: opts.maxResults },
        });
        ok(res, () => {
          if (res?.answer) {
            line(res.answer);
            line("");
          }
          const results = res?.results ?? [];
          if (!results.length) return line(pc.dim("No results."));
          for (const r of results) {
            line(`${r.title || pc.dim("(untitled)")}  ${pc.dim(r.url)}`);
          }
        });
      }),
    );
}
