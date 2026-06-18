import { spawn } from "node:child_process";
import { platform } from "node:os";
import type { Command } from "commander";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ok, success, warn } from "../output.js";
import { WorkserError } from "../errors.js";

export function registerOpen(program: Command): void {
  program
    .command("open")
    .description("Open the project's live app in a browser")
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const status = await api(ctx, "/v1/status", { query: { project: projectId } });
        const url = status?.latestDeploy?.url ?? status?.project?.url;
        if (!url) throw new WorkserError("No live URL yet — deploy first with `workser deploy`.", { code: "no_url" });
        openUrl(url);
        ok({ url }, () => success(`Opening ${url}`));
      }),
    );
}

function openUrl(url: string): void {
  const cmd = platform() === "darwin" ? "open" : platform() === "win32" ? "cmd" : "xdg-open";
  const args = platform() === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    warn(`Open it manually: ${url}`);
  }
}
