import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { readProjectLink, readSession } from "../config.js";
import { ENV_BASE_URLS, resolveEnv } from "../env.js";
import { ok, line } from "../output.js";

/**
 * `workser doctor` — print the resolved connection so onboarding problems
 * ("which endpoint? am I authed? which project?") are debuggable in one command.
 * Purely local: it never makes a network call, so it works even when the daemon
 * is down. The token is masked; only its presence + source are shown.
 */
export function registerDoctor(program: Command): void {
  program
    .command("doctor")
    .description("Print the resolved endpoint, mode, token presence (masked), and current project")
    .action(
      action(({ ctx, opts }) => {
        const session = readSession();
        const link = readProjectLink(ctx.cwd);
        // Which backend this shell targets. Worth printing even in daemon mode:
        // it is what a cloud call would hit, and a surprising value here is the
        // usual explanation for "why is my data not in the dashboard I'm on?".
        const env = resolveEnv();
        // `session.endpoint` outranks $WORKSER_ENV on purpose — the saved token
        // belongs to the endpoint it was minted against, so honouring the env
        // var here would just 401. But someone who exported WORKSER_ENV=dev and
        // is still talking to prod deserves to be told why, not left guessing.
        const envIgnored =
          Boolean(process.env.WORKSER_ENV) &&
          ctx.mode === "cloud" &&
          ctx.endpoint !== ENV_BASE_URLS[env];

        const tokenSource = opts.token
          ? "--token"
          : process.env.WORKSER_TOKEN
            ? "$WORKSER_TOKEN"
            : session.token
              ? "session"
              : undefined;

        const endpointSource = opts.endpoint
          ? "--endpoint"
          : process.env.WORKSER_DAEMON_URL
            ? "$WORKSER_DAEMON_URL"
            : session.endpoint
              ? "session"
              : process.env.WORKSER_API_URL
                ? "$WORKSER_API_URL"
                : `cloud-default: ${env}`;

        const projectSource = opts.project
          ? "--project"
          : link?.projectId
            ? ".workser link"
            : session.defaultProjectId
              ? "session"
              : undefined;

        const report = {
          endpoint: ctx.endpoint,
          endpointSource,
          env,
          envIgnored,
          mode: ctx.mode,
          token: {
            present: Boolean(ctx.token),
            masked: ctx.token ? maskToken(ctx.token) : null,
            source: tokenSource ?? null,
          },
          project: {
            id: ctx.projectId ?? null,
            name: link?.name ?? null,
            source: projectSource ?? null,
          },
          cwd: ctx.cwd,
          workspace: session.workspaceName ?? null,
        };

        ok(report, () => {
          line(pc.bold("workser doctor"));
          line(`  endpoint:  ${ctx.endpoint} ${pc.dim(`(${endpointSource})`)}`);
          line(
            `  env:       ${env === "prod" ? pc.yellow(env) : env}` +
              pc.dim(process.env.WORKSER_ENV ? "  ($WORKSER_ENV)" : "  (default)"),
          );
          line(`  mode:      ${ctx.mode}`);
          line(
            `  token:     ${
              ctx.token
                ? `${maskToken(ctx.token)} ${pc.dim(`(${tokenSource})`)}`
                : pc.yellow("none — run `workser login`")
            }`,
          );
          line(
            `  project:   ${ctx.projectId ?? pc.dim("none")}` +
              (link?.name ? `  ${pc.dim(`(${link.name})`)}` : "") +
              (projectSource ? pc.dim(`  [${projectSource}]`) : ""),
          );
          line(`  cwd:       ${ctx.cwd}`);
          if (envIgnored) {
            line("");
            line(
              pc.yellow(
                `  WORKSER_ENV=${env} is not in effect — ${endpointSource} wins.`,
              ),
            );
            line(
              pc.dim(
                `  Re-run \`workser login\` to switch (the saved token is tied to ${ctx.endpoint}),`,
              ),
            );
            line(pc.dim(`  or pass --endpoint ${ENV_BASE_URLS[env]}.`));
          }
        });
      }),
    );
}

/** Show the shape of a token without revealing it: first 3 + last 3 chars. */
function maskToken(token: string): string {
  if (token.length <= 8) return "•".repeat(token.length);
  return `${token.slice(0, 3)}${"•".repeat(Math.min(token.length - 6, 12))}${token.slice(-3)}`;
}
