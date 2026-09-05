import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { runTarget } from "../context.js";
import { ok, line, info } from "../output.js";
import { WorkserError } from "../errors.js";

/**
 * `workser ask` — ask the user something and wait for the answer.
 *
 * The command BLOCKS until the person answers, then prints their answer. From
 * the agent's point of view it is an ordinary tool call that happens to take a
 * while: ask, get an answer, keep going — no need to end the turn and hope the
 * user's next message addresses the question.
 *
 * What the user sees is a real card in the conversation (approval buttons, a
 * text field, a choice list — whichever the type implies), not a line of prose
 * buried in the transcript. It is the same `ai_requests` record the cloud
 * agents use, so it renders through UI that already exists.
 *
 * There is always a timeout. A run that blocks forever behind a question
 * nobody is present to answer is worse than one that proceeds on a documented
 * assumption, so the wait ends and says so.
 */
const TYPES = [
  "input",
  "choice",
  "approval",
  "confirmation",
  "file_upload",
  "information",
  /**
   * "Add an app to this project, and do it for me."
   *
   * NOT an approval with a well-worded message. What the user is agreeing to
   * is real infrastructure — a repository, hosting, a folder on their machine,
   * sometimes a database — and they are entitled to see WHICH app before they
   * agree, which a sentence and a Yes button cannot show. Needs `--app-type`;
   * `--app-name` is what it will be called.
   *
   * You cannot create an app yourself, and that is deliberate: an agent must
   * not be able to provision things on somebody's account by deciding to. This
   * asks. Their click is what creates it, and the answer tells you the new
   * app's id so the rest of your plan can be scoped to it.
   */
  "create_app",
] as const;

/**
 * THE APP KINDS AN OWNER CAN ACTUALLY BE ASKED FOR.
 *
 * This list is why a desktop app got created as a web app. The flag's help
 * text used to read `web | mobile | api | worker | cron | python` — which
 * offered three kinds core-api refuses to create and OMITTED `desktop`, the
 * one that works. An agent that wanted a desktop app read the list, did not
 * find it, and asked for the nearest thing on offer. The owner clicked Yes on
 * a card that said "desktop", and a Next.js web app was provisioned: right
 * intent, wrong app, no error anywhere.
 *
 * MUST MATCH the `creatable: true` rows in core-api's `APP_TYPE_STACKS`. A
 * kind here that is not creatable there is a card the owner cannot act on; a
 * creatable kind missing here is the bug above, again.
 */
const APP_TYPES = [
  "web",
  "mobile",
  "desktop",
  // `api` is the shorthand; the two concrete spellings pick the runtime and
  // are accepted at this boundary for an agent that knows which one it wants.
  "api",
  "api-hono",
  "api-python",
] as const;

export function registerAsk(program: Command): void {
  program
    .command("ask <message>")
    .description("Ask the user a question and wait for their answer")
    .option(
      "-t, --type <type>",
      `${TYPES.join(" | ")} — picks the UI they get (default: input)`,
      "input",
    )
    .option("--title <title>", "short heading for the card (default: derived)")
    .option(
      "-o, --option <value>",
      "a choice (repeat for each; implies --type choice)",
      collect,
      [] as string[],
    )
    .option(
      "--app-type <type>",
      `create_app only: ${APP_TYPES.join(" | ")}`,
    )
    .option(
      "--app-name <name>",
      "create_app only: what the app should be called",
    )
    .option("--priority <level>", "low | normal | high | urgent", "normal")
    .option(
      "--timeout <seconds>",
      "how long to wait before giving up (default: 600, max: 3600)",
      "600",
    )
    .action(
      action(async ({ ctx, opts, args }) => {
        const message = String(args[0] ?? "").trim();
        if (!message) {
          throw new WorkserError("Say what you want to ask.", {
            code: "bad_request",
          });
        }

        const options = opts.option as string[];
        // Passing choices without saying --type choice is unambiguous enough
        // to just honour, rather than making the agent get it right twice.
        const type =
          options.length > 0 && opts.type === "input" ? "choice" : opts.type;

        if (!TYPES.includes(type)) {
          throw new WorkserError(
            `Unknown --type "${type}". Use one of: ${TYPES.join(", ")}.`,
            { code: "bad_request" },
          );
        }
        if (type === "choice" && options.length === 0) {
          throw new WorkserError(
            "A choice needs options: `--option A --option B`.",
            { code: "bad_request" },
          );
        }
        // Refused rather than defaulted to `web`. Guessing would create the
        // wrong kind of app in the one situation this type exists for — an
        // agent asking precisely because the project has no MOBILE app.
        if (type === "create_app" && !opts.appType) {
          throw new WorkserError(
            `Say which kind of app: \`--app-type desktop\`. One of: ${APP_TYPES.join(", ")}.`,
            { code: "bad_request" },
          );
        }
        // REFUSED, NOT PASSED THROUGH. An unknown kind used to travel all the
        // way to the card, which defaulted it to `web` — so a typo or a kind
        // this build cannot make came back as a web app rather than as a
        // mistake. Fail here, where the agent can read the list and retry.
        if (
          type === "create_app" &&
          opts.appType &&
          !APP_TYPES.includes(opts.appType as (typeof APP_TYPES)[number])
        ) {
          throw new WorkserError(
            `Unknown --app-type "${opts.appType}". Use one of: ${APP_TYPES.join(", ")}.`,
            { code: "bad_request" },
          );
        }

        const timeoutSeconds = Number(opts.timeout);
        if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
          throw new WorkserError("--timeout must be a positive number.", {
            code: "bad_request",
          });
        }

        info(pc.dim("Waiting for the user to answer…"));

        const res = await api(ctx, `/v1/runs/${runTarget(ctx)}/ask`, {
          body: {
            type,
            title: opts.title || deriveTitle(message),
            message,
            options: options.length ? options : undefined,
            appType: opts.appType,
            appName: opts.appName,
            priority: opts.priority,
            timeoutSeconds,
          },
        });

        // Not an error: "they didn't answer" is a real outcome the agent has
        // to handle, and throwing would make it look like the tool broke.
        ok(res, () => printAnswer(res));
      }),
    );
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/** First sentence, capped — enough to label the card without a second flag. */
function deriveTitle(message: string): string {
  const first = message.split(/(?<=[.?!])\s/)[0] ?? message;
  const trimmed = first.trim();
  return trimmed.length > 70 ? `${trimmed.slice(0, 67)}…` : trimmed;
}

function printAnswer(res: any): void {
  if (!res) return;
  if (res.status === "answered") {
    line(`  ${pc.green("answered")}`);
    const value = extract(res.response);
    if (value) line(`  ${value}`);
    return;
  }
  line(`  ${pc.yellow(res.status)}  ${pc.dim(res.reason ?? "")}`);
}

/** Pull the human-meaningful part out of the response envelope. */
function extract(response: unknown): string {
  if (response == null) return "";
  if (typeof response === "string") return response;
  if (typeof response === "object") {
    const r = response as Record<string, unknown>;
    for (const key of ["value", "text", "answer", "choice", "input"]) {
      if (typeof r[key] === "string") return r[key] as string;
    }
    if (typeof r.approved === "boolean") {
      return r.approved ? "approved" : "declined";
    }
    return JSON.stringify(response);
  }
  return String(response);
}
