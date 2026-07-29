import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ok, line } from "../output.js";

/**
 * `workser memory` — durable, cross-conversation project memory (Supermemory,
 * scoped per-project). The SAME memory space Workser's cloud agents already
 * write to for this project — content added here is searchable from any
 * later conversation/task on this project, local or cloud.
 *
 *   POST /v1/projects/:id/memory                 { content, metadata?, customId? }
 *   GET  /v1/projects/:id/memory/search?q=&limit=&threshold=
 *   POST /v1/projects/:id/memory/:memoryId/forget
 */
export function registerMemory(program: Command): void {
  const memory = program
    .command("memory")
    .description("Durable, cross-conversation project memory (shared with cloud agents on the same project)");

  memory
    .command("add <content>")
    .description("Store something worth remembering across future conversations")
    .option("--metadata <json>", "extra metadata for filtering, as a JSON string")
    .option("--id <customId>", "custom id for dedup/updates")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, `/v1/projects/${projectId}/memory`, {
          body: {
            content: args[0],
            metadata: opts.metadata ? JSON.parse(opts.metadata) : undefined,
            customId: opts.id,
          },
        });
        ok(res, () => line(`Remembered (${res?.id ?? "?"}).`));
      }),
    );

  memory
    .command("search <query>")
    .description("Search this project's memory")
    .option("--limit <n>", "max results", "10")
    .option("--threshold <n>", "similarity threshold (0-1)", "0.6")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, `/v1/projects/${projectId}/memory/search`, {
          query: { q: args[0], limit: opts.limit, threshold: opts.threshold },
        });
        ok(res, () => {
          const results = res?.results ?? res ?? [];
          if (!results?.length) return line(pc.dim("No matching memories."));
          for (const r of results) {
            line(`${pc.dim(r.id ?? "?")}  ${r.memory ?? r.content ?? ""}`);
          }
        });
      }),
    );

  memory
    .command("forget <memoryId>")
    .description("Soft-delete one memory (excluded from search, not permanently removed)")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, `/v1/projects/${projectId}/memory/${args[0]}/forget`, {
          method: "POST",
        });
        ok(res, () => line("Forgotten."));
      }),
    );
}
