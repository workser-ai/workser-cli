import type { Command } from "commander";
import { action } from "../run.js";
import { api } from "../client.js";
import { ok, line } from "../output.js";

export function registerWhoami(program: Command): void {
  program
    .command("whoami")
    .description("Show the authenticated user and workspace")
    .action(
      action(async ({ ctx }) => {
        const data = await api(ctx, "/v1/whoami");
        ok(data, () => {
          line(`${data.email ?? data.id ?? "unknown"}`);
          if (data.workspace?.name) line(`workspace: ${data.workspace.name}`);
        });
      }),
    );
}
