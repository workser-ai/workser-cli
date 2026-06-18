import type { Command } from "commander";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ok, success, line } from "../output.js";

export function registerAuth(program: Command): void {
  const auth = program.command("auth").description("Manage the project's auth (Better Auth)");

  auth
    .command("enable")
    .description("Enable authentication for the project (idempotent)")
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, `/v1/projects/${projectId}/provision/auth`, { body: {} });
        ok(res, () => success(res.created === false ? "Auth already enabled." : "Auth enabled."));
      }),
    );

  auth
    .command("status")
    .description("Show whether auth is enabled and how it's configured")
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, `/v1/projects/${projectId}/auth`);
        ok(res, () => line(res.enabled ? `enabled (${(res.providers ?? []).join(", ") || "email"})` : "disabled"));
      }),
    );
}
