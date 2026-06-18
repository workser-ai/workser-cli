import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ok, success, line } from "../output.js";
import { WorkserError } from "../errors.js";

export function registerEnv(program: Command): void {
  const env = program.command("env").description("Manage project environment variables");

  env
    .command("set <pairs...>")
    .description("Set one or more KEY=VALUE variables")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const pairs = (args[0] as string[]).map((p) => {
          const i = p.indexOf("=");
          if (i < 0) throw new WorkserError(`Invalid pair "${p}". Use KEY=VALUE.`, { code: "bad_input" });
          return { key: p.slice(0, i), value: p.slice(i + 1) };
        });
        const res = await api(ctx, `/v1/projects/${projectId}/env`, { body: { vars: pairs } });
        ok(res, () => success(`Set ${pairs.length} variable(s): ${pairs.map((p) => p.key).join(", ")}`));
      }),
    );

  env
    .command("get <key>")
    .description("Print one variable's value (sensitive)")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, `/v1/projects/${projectId}/env/${encodeURIComponent(args[0])}`);
        ok(res, () => line(res.value ?? ""));
      }),
    );

  env
    .command("list")
    .description("List variable keys (values masked)")
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const items = await api(ctx, `/v1/projects/${projectId}/env`);
        ok(items, () => {
          if (!items?.length) return line(pc.dim("No variables set."));
          for (const v of items) line(`${v.key}${pc.dim(" = " + (v.masked ?? "••••"))}`);
        });
      }),
    );

  env
    .command("rm <key>")
    .description("Remove a variable")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        await api(ctx, `/v1/projects/${projectId}/env/${encodeURIComponent(args[0])}`, {
          method: "DELETE",
        });
        ok({ removed: args[0] }, () => success(`Removed ${args[0]}.`));
      }),
    );
}
