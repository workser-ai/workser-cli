import type { Command } from "commander";
import pc from "picocolors";

import { action } from "../run.js";
import { api } from "../client.js";
import { requireDaemon } from "../context.js";
import { ok, line, success } from "../output.js";

/**
 * `workser health` — is what we shipped still answering?
 *
 * Every other check in this CLI asks about code. This one asks about the thing
 * the owner actually bought: a web address that works. It is the question with
 * the shortest half-life — true at the moment it is asked and possibly false an
 * hour later — which is why the desktop also asks it on a timer and files an
 * incident when the answer stays no (`health-watch.ts`).
 *
 * It probes THROUGH THE DAEMON rather than fetching here, for the same reason
 * `api call` does: the check an agent ran and the check the owner ran have to
 * be the same check, counted in the same streak. Two independent counters would
 * disagree about how long something had been down, and the one the owner reads
 * would be the wrong one.
 */
interface HealthCheck {
  appId: string;
  appName: string;
  environment: "preview" | "production";
  url: string;
  ok: boolean;
  status: number | null;
  ms: number;
  error: string | null;
  failures: number;
  incidentOpened: boolean;
}

interface HealthResponse {
  checks: HealthCheck[];
  failuresBeforeIncident: number;
  note: string | null;
}

export function registerHealth(program: Command): void {
  program
    .command("health")
    .description("Check that the published apps in this project are still answering")
    .option("--app <webAppId>", "check one app rather than all of them")
    .action(
      action(async ({ ctx, opts }) => {
        // The probe is made from THIS machine on purpose — an answer from a
        // server would be about the server's network, not the owner's. Without
        // the desktop app there is nothing here to make it.
        requireDaemon(ctx, "health", "checks your published sites from this computer");
        const path = opts.app
          ? `/v1/apps/${encodeURIComponent(String(opts.app))}/health`
          : `/v1/health`;
        const res = (await api(ctx, path)) as HealthResponse;
        ok(res, () => print(res));
        // A failing probe is a real failure of this command: a step that runs
        // `workser health` before declaring the work done should not pass while
        // the site is down.
        if (res?.checks?.some((c) => !c.ok)) process.exitCode = 1;
      }),
    );
}

function print(res: HealthResponse): void {
  if (!res?.checks?.length) {
    // `note` explains WHY there is nothing — most often "nothing published
    // yet", which must never read as "everything is fine".
    line(pc.dim(res?.note ?? "Nothing to check."));
    return;
  }

  for (const c of res.checks) {
    const mark = c.ok ? pc.green("up  ") : pc.red("down");
    const timing = pc.dim(`${c.ms}ms`);
    const detail = c.ok
      ? timing
      : pc.dim(`${c.error ?? "no answer"}${c.failures > 1 ? ` · ${c.failures} in a row` : ""}`);
    line(`  ${mark}  ${c.appName} ${pc.dim(`(${c.environment})`)}  ${c.url}  ${detail}`);
    if (c.incidentOpened) {
      line(pc.yellow(`        An incident has been opened on the board for this.`));
    }
  }

  const down = res.checks.filter((c) => !c.ok);
  line("");
  if (!down.length) {
    success(
      `Everything published is answering (${res.checks.length} ${res.checks.length === 1 ? "address" : "addresses"} checked).`,
    );
    return;
  }
  const production = down.filter((c) => c.environment === "production").length;
  line(
    pc.red(
      `${down.length} of ${res.checks.length} not answering` +
        (production ? ` — ${production} customer-facing.` : " (preview only)."),
    ),
  );
}
