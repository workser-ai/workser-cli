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
            line(`${pc.dim(r.id ?? "?")}  ${memoryText(r)}`);
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

/**
 * The text of one search hit, whichever shape the backend sent it in.
 *
 * Search returns TWO row shapes from the same query, and they are not
 * versions of each other — they arrive interleaved in one result list:
 *
 *   { id, memory: "…", rootMemoryId, metadata }        // a whole memory
 *   { id, chunk:  "…", documents: [{title}], chunks }  // a chunk of one
 *
 * This read `r.memory ?? r.content ?? ""`, so every chunk row rendered as a
 * bare id and nothing else. That is the worst possible failure for a recall
 * tool: the hit is RIGHT THERE, ranked first, and the agent reading the
 * output sees an empty line and concludes the project never recorded it.
 * Observed 2026-09-02 — a decision written seconds earlier came back top of
 * the list, blank, and was re-litigated as if it had never been stored.
 *
 * The final fallback is a placeholder rather than `""` on purpose: a row with
 * no text at all is a fact worth printing, and a silent blank line reads as
 * an empty store instead of an unreadable row.
 */
function memoryText(r: any): string {
  const text = r?.memory ?? r?.chunk ?? r?.content ?? r?.text;
  if (typeof text === "string" && text.trim()) return text;
  // A chunk row carries its parent document's title, which is a truthful
  // (if shorter) answer to "what is this".
  const title = r?.documents?.[0]?.title;
  if (typeof title === "string" && title.trim()) return title;
  return pc.dim("(no readable text on this row)");
}
