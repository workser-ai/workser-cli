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

  const verb = argv[0];
  if (!verb) return;

  const pair = `${argv[0]} ${argv[1] ?? ""}`.trim();
  // `approval request` only READS — it tells the owner the plan is ready. The
  // two that decide are the ones no agent may run.
  if (
    NEVER[pair] &&
    !(pair === "task approval" && (argv[2] === "request" || !argv[2]))
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
