import { spawnSync } from "node:child_process";
import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { readProjectLink, readSession } from "../config.js";
import { ENV_BASE_URLS, resolveEnv } from "../env.js";
import { ok, line } from "../output.js";

/**
 * `workser doctor` — print the resolved connection so onboarding problems
 * ("which endpoint? am I authed? which project?") are debuggable in one command.
 * No network call, so it works even when the daemon is down. The token is
 * masked; only its presence + source are shown.
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

        const git = gitVersion();

        const report = {
          endpoint: ctx.endpoint,
          endpointSource,
          env,
          envIgnored,
          mode: ctx.mode,
          git: { present: git !== null, version: git },
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
          line(`  git:       ${git ?? pc.dim("not on this shell's PATH")}`);
          if (!git) {
            line("");
            // NOT "install git". The app ships its own and puts it on the
            // agent's PATH (see the desktop's `git-bin.ts`), so sync, deploy,
            // checkpoint and restore all work on a computer that has never had
            // one — which is most of our users. Telling a shop owner to run
            // `xcode-select --install` to publish their own website was the
            // wrong instruction; the only thing missing here is git in THIS
            // terminal, which matters only if the user wants it themselves.
            line(
              pc.dim(
                "  Workser brings its own git, so syncing and publishing still work.",
              ),
            );
            line(
              pc.dim(
                `  Only needed if you want to run git yourself here. ${GIT_INSTALL_HINT}`,
              ),
            );
          }
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

/**
 * Is there a usable `git` on PATH, and which one?
 *
 * WHY DOCTOR ASKS THIS. Workser needs no git CREDENTIAL — code moves as bundles
 * over the Workser API and the managed folder has no remote — but it does need
 * the git BINARY: every sync, pull, push, deploy and ship-status call in the
 * daemon shells out to it. Nothing checked, so on a machine without one
 * (Windows with no Git for Windows; a Mac where Command Line Tools were never
 * installed) all of those failed with a bare ENOENT that reads like a Workser
 * outage. This is the command people are told to run when things are broken, so
 * it is the right place to name the actual cause.
 *
 * `spawnSync` and not `execSync`: a missing binary comes back as `error` rather
 * than a thrown exception, so the absent case needs no try/catch to be the
 * ordinary path it is. Local and instant — doctor still makes no network call.
 */
function gitVersion(): string | null {
  try {
    const res = spawnSync("git", ["--version"], {
      encoding: "utf8",
      timeout: 5_000,
      // A macOS box with no Command Line Tools has a `git` SHIM that pops a GUI
      // installer when run. Inheriting stdio would surface that dialog from a
      // command the user expects to just print a report.
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (res.error || res.status !== 0) return null;
    const out = (res.stdout || "").toString().trim();
    return out || null;
  } catch {
    return null;
  }
}

/** Platform-appropriate way to get git, for the doctor's fix line. */
const GIT_INSTALL_HINT =
  process.platform === "darwin"
    ? "Install it with: xcode-select --install"
    : process.platform === "win32"
      ? "Install it from: https://git-scm.com/download/win"
      : "Install it with your package manager, e.g. apt install git";

/** Show the shape of a token without revealing it: first 3 + last 3 chars. */
function maskToken(token: string): string {
  if (token.length <= 8) return "•".repeat(token.length);
  return `${token.slice(0, 3)}${"•".repeat(Math.min(token.length - 6, 12))}${token.slice(-3)}`;
}
