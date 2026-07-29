import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { ok, line } from "../output.js";

/**
 * `workser tool` — call the same computer-use capability engine the cloud
 * Bridge agent drives when it controls a user's machine remotely: filesystem,
 * shell, screenshots, mouse/keyboard, clipboard, notifications, and a basic
 * browser. Reused, not reimplemented — the daemon routes this through the
 * SAME capability router + security policy (rate limits, blocked paths/
 * commands), and gates sensitive actions behind an approval prompt in
 * Workser Orbit exactly like other gated actions (env get, deploy --prod).
 *
 *   GET  /v1/tool/list   -> [{ name, description, category, parameters }]
 *   POST /v1/tool/:name  { ...params } -> the tool's result
 *
 * This is a curated subset, not the full capability surface (deeper browser
 * automation, process/window management aren't exposed here yet) — run
 * `workser tool list` to see what's actually available right now.
 */
export function registerTool(program: Command): void {
  const tool = program
    .command("tool")
    .description(
      "Computer-use tools: filesystem, shell, screenshot, input control, clipboard, notifications, basic browser",
    );

  tool
    .command("list")
    .description("List the tools available to you right now")
    .action(
      action(async ({ ctx }) => {
        const tools = await api(ctx, "/v1/tool/list");
        ok(tools, () => {
          if (!tools?.length) return line(pc.dim("No tools available."));
          const byCategory = new Map<string, any[]>();
          for (const t of tools) {
            const list = byCategory.get(t.category) ?? [];
            list.push(t);
            byCategory.set(t.category, list);
          }
          for (const [category, items] of byCategory) {
            line(pc.bold(category) + ":");
            for (const t of items) {
              line(`  ${t.name}  ${pc.dim(t.description ?? "")}`);
            }
          }
        });
      }),
    );

  tool
    .command("run <name>")
    .description('Execute one tool, e.g. workser tool run readFile --body \'{"path":"..."}\'')
    .option("--body <args>", "the tool's parameters as a JSON string", "{}")
    .action(
      action(async ({ ctx, args, opts }) => {
        const res = await api(ctx, `/v1/tool/${args[0]}`, {
          method: "POST",
          body: JSON.parse(opts.body),
        });
        ok(res, () => line(JSON.stringify(res, null, 2)));
      }),
    );
}
