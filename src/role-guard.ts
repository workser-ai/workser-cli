import { WorkserError } from "./errors.js";

/**
 * What the agent running this command is allowed to do.
 *
 * Orbit sets `WORKSER_ROLE` on a dispatched subagent's process. The desktop
 * decides the policy (`role-capabilities.ts`); this file is the half that can
 * actually stop something, because it sits between the agent and the API.
 *
 * WHY IT IS HERE AND NOT ONLY IN THE PROMPT. "You are the QA reviewer, do not
 * edit the code" is a request. An agent that has just found the bug it was
 * asked to look for will fix it — helpfully, and then report that the check
 * passed, against code the owner has not seen. The refusal has to come from
 * something the agent cannot talk its way past.
 *
 * The list mirrors `role-capabilities.ts` in the desktop rather than importing
 * it: this CLI has no build-time dependency on the app's source (same reasoning
 * `board.ts` and `ask.ts` give for their own literal lists). If one changes,
 * change both — the failure mode is a role that can run one verb too many, so
 * it is worth the duplication being visible.
 *
 * NO ROLE MEANS NO LIMIT. The CLI is also run by hand and from the manager's
 * own turn, and neither of those is a subagent; an absent variable must not
 * mean "deny everything" or the whole CLI stops working outside a dispatch.
 */
const READS = [
  "task", "board", "doc", "decision", "memory", "search", "verify", "logs",
  "status", "help", "whoami", "login", "auth", "project", "open", "doctor",
  // Both READ and report. `scan` reads files and shells out to npm; `health`
  // makes a GET request to an address that is already public. Neither can
  // change anything, which is why the roles that exist to look — qa, security,
  // sre, analyst — get them without getting anything else.
  "scan", "health",
  // Read-only views of what is running. Added with Phase 6a: an SRE that can
  // read logs but cannot list deployments or read the app's address is being
  // asked to diagnose an outage with one eye shut.
  "urls", "deployments",
  // Reading the plan and what is used against it. An agent proposing "add
  // another project" can only sensibly propose it if it can find out the plan
  // allows two and two already exist.
  "usage",
];

const BUILDS = [
  ...READS, "app", "env", "db", "storage", "checkpoint", "artifact", "image",
  "design", "ask", "sync", "tool", "workflow", "neon", "business",
];

const ROLE_VERBS: Record<string, string[]> = {
  pm: [...READS, "ask", "app"],
  architect: [...BUILDS, "versions"],
  web: BUILDS,
  api: BUILDS,
  mobile: BUILDS,
  python: BUILDS,
  automation: BUILDS,
  designer: BUILDS,
  qa: READS,
  security: READS,
  analyst: READS,
  sre: [...READS, "deploy", "domain", "versions"],
  devops: [...BUILDS, "deploy", "domain", "versions"],
  // NOTE: `deployments` reaches READS above, so every role can LIST and
  // INSPECT. That is correct — history is a read. The two verbs that change
  // production (`promote`, `rollback`) are not gated here at all, and must not
  // be: they are gated in the DAEMON, as `deploy.prod`, which is a door "just
  // do it" cannot open. A second, verb-name-based rule here would be a weaker
  // copy of a control that already works.
};

/** Verbs no subagent may run, whatever its role. */
const NEVER: Record<string, string> = {
  // Approving is the owner's, full stop. An agent that can approve the plan it
  // proposed has removed the only gate this product has.
  "task approval": "Only the owner can approve a plan.",
};

export function assertRoleMayRun(argv: string[]): void {
  const role = (process.env.WORKSER_ROLE ?? "").trim();
  if (!role) return;

  const commandArgv = stripLeadingGlobalOptions(argv);
  const verb = commandArgv[0];
  if (!verb) return;

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

  const allowed = ROLE_VERBS[role];
  // An unknown role reads and nothing else: the safe failure for a typo in a
  // role name is a subagent that can look but not act.
  const list = allowed ?? READS;
  if (!list.includes(verb)) {
    throw new WorkserError(
      `The ${role} role can't run \`workser ${verb}\`. ` +
        `Report what you found instead, and the step that owns this will do it.`,
      { code: "role_forbidden" },
    );
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
