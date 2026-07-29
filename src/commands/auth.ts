import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ok, line } from "../output.js";

export function registerAuth(program: Command): void {
  const auth = program.command("auth").description("Provision and inspect the project's auth (Better Auth)");

  auth
    .command("enable")
    .description("Enable auth for the project (idempotent)")
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, `/v1/projects/${projectId}/provision/auth`, { body: {} });
        ok(res, () => {
          const providers = (res.providers ?? []).join(", ") || "email";
          line(
            res.created === false
              ? `Auth already enabled${pc.dim(`  (${providers})`)}.`
              : `Enabled auth ${pc.dim(`(${providers})`)}.`,
          );
        });
      }),
    );

  auth
    .command("status")
    .description("Show whether auth is enabled and how it's configured")
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, `/v1/projects/${projectId}/auth`);
        ok(res, () => {
          if (!res.enabled) return line("disabled");
          const providers = (res.providers ?? []).join(", ") || "email";
          line(`enabled ${pc.dim(`(${providers})`)}`);
          if (res.authMode) line(`  mode: ${res.authMode}`);
          if (res.authMode === "neon_managed") {
            if (res.neonAuthOwnedBy) line(`  owned by: ${res.neonAuthOwnedBy}`);
            if (res.neonAuthTransferStatus) line(`  transfer: ${res.neonAuthTransferStatus}`);
          }
        });
      }),
    );
}
