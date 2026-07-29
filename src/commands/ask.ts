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
