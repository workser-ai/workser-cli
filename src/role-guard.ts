import { WorkserError } from "./errors.js";

/**
 * What a dispatched agent may run.
 *
 * ─── WHAT THIS USED TO BE, AND WHY IT ISN'T ANY MORE ────────────────────────
 *
 * This file held a per-role allowlist of CLI verbs: `qa` and `security` and
 * `analyst` could read, the builders could build, and anything outside your
 * role's list was refused with "The architect role can't run `workser goal`."
 *
 * The intent was sound and the result was not. Three things went wrong, and
 * the third is the one that decided it:
 *
 *   IT GUESSED WHO WOULD NEED WHAT. The plan is written by a manager agent at
 *   runtime; nothing decides in advance which role will end up needing to read
 *   the board, list artifacts, or check a goal. Every guess this list made was
 *   wrong for somebody, and the list grew by one verb each time somebody hit
 *   it — `requirement`, `artifact`, `note`, `scan`, `health`, `usage`,
 *   `deployments` were all added exactly that way, each after a real agent was
 *   blocked doing its actual job.
 *
 *   IT FOUGHT THE PROMPT. Every role's preamble tells it to run `workser
 *   artifact list` before non-trivial work. Five roles were then refused that
 *   verb here, so the agent spent its run trying to obey an instruction this
 *   file would not let it obey.
 *
 *   AND IT LOOKED LIKE A BROKEN PRODUCT. A refusal is a non-zero exit with an
 *   error string, and it renders in the owner's thread as a failed step in red
 *   — indistinguishable from a real fault. The owner sees their software
 *   erroring at itself. That cost is paid by the person who bought the
 *   product, for a rule that only ever protected us from an agent reading
 *   something.
 *
 * ─── WHAT REPLACES IT: SCOPE IS TAUGHT, DANGER IS GATED ─────────────────────
 *
 * A role is a job description, not a permission boundary, and it is delivered
 * where job descriptions belong — in the agent's briefing (`agent-docs.ts` and
 * the role preamble). "You are the tester; report what you find rather than
 * fixing it" is guidance the agent follows because it is told the scope
 * clearly, and being occasionally wrong about it costs a message, not a step.
 *
 * THE ACTIONS THAT CAN ACTUALLY HURT SOMEBODY ARE NOT GUARDED HERE AND NEVER
 * WERE. They are gated in the daemon, by OPERATION rather than by verb name,
 * on the one path every CLI call travels — see `orbit/daemon/approval.ts`:
 *
 *   `GATED_ACTIONS` (19 of them) raises an approval card the owner answers:
 *   deploy.prod, env.get, db.delete, db.query.destructive, db.connectionString,
 *   domain.set, payment.live, key.rotate, neon.bucket.delete, and the rest.
 *
 *   `NEVER_AUTO` — deploy.prod, payment.live, db.delete, neon.bucket.delete —
 *   cannot be opened even by "just do it" autonomy.
 *
 * That gate is strictly stronger than this file ever was: it cannot be evaded
 * by a differently-named verb, and it asks the owner rather than guessing on
 * their behalf. What an agent may WRITE is likewise unchanged — that is its
 * filesystem mode (`role-capabilities.ts`), applied to the process itself.
 *
 * ─── WHAT IS STILL REFUSED HERE ─────────────────────────────────────────────
 *
 * Exactly one thing, and it is not about roles: approving a plan. That is the
 * owner's single decision in this product, and an agent that can approve the
 * plan it just wrote has removed the only gate the whole design rests on.
 *
 * NO ROLE MEANS NO LIMIT, still. The CLI is also run by hand and from the
 * manager's own turn, and neither is a dispatched subagent.
 */

/** Refused for every agent, whatever its role — see the note above. */
const NEVER: Record<string, string> = {
  "task approval": "Only the owner can approve a plan.",
};

export function assertRoleMayRun(argv: string[]): void {
  // Still keyed on being a dispatched agent at all: a person at a terminal is
  // the owner, and the owner may approve their own plan.
  const role = (process.env.WORKSER_ROLE ?? "").trim();
  if (!role) return;

  const commandArgv = stripLeadingGlobalOptions(argv);
  if (!commandArgv[0]) return;

  const pair = `${commandArgv[0]} ${commandArgv[1] ?? ""}`.trim();
  // `approval request` only READS — it tells the owner the plan is ready. The
  // two that decide are the ones no agent may run.
  if (
    NEVER[pair] &&
    !(
      pair === "task approval" &&
      (commandArgv[2] === "request" || !commandArgv[2])
    )
  ) {
    throw new WorkserError(NEVER[pair], { code: "role_forbidden" });
  }
}

/**
 * Commander accepts global options before or after a subcommand. The role
 * gate runs before Commander, so it must skip the leading ones itself or
 * `workser --json task list` is misread as a forbidden `--json` verb.
 */
function stripLeadingGlobalOptions(argv: string[]): string[] {
  const takesValue = new Set([
    "-p",
    "--project",
    "-C",
    "--cwd",
    "--endpoint",
    "--token",
  ]);
  const flags = new Set(["--json", "-q", "--quiet", "-v", "--version"]);

  let index = 0;
  while (index < argv.length) {
    const token = argv[index];
    if (flags.has(token)) {
      index += 1;
      continue;
    }
    if (takesValue.has(token)) {
      index += 2;
      continue;
    }
    if (
      token.startsWith("--project=") ||
      token.startsWith("--cwd=") ||
      token.startsWith("--endpoint=") ||
      token.startsWith("--token=")
    ) {
      index += 1;
      continue;
    }
    break;
  }
  return argv.slice(index);
}
