/**
 * MODELS AN AGENT MAY NOT SPEND THE OWNER'S MONEY ON, ON ITS OWN.
 *
 * Two commands here let one agent decide what another one runs on:
 * `workser agent spawn --model` stands up a teammate, and
 * `workser task subtask add|update --model` chooses the engine for a step. Both
 * are unattended by definition — nobody is watching the moment the choice is
 * made — and a model's price is now something a program picks dozens of times a
 * day on somebody else's account.
 *
 * Fable is the first entry: it is the expensive tier, and no delegated step is
 * worth it. A PERSON can still choose it — from the model picker, on their own
 * team configuration, or by hand on one step — because that is a choice made by
 * whoever pays for it. What is refused is the automatic path.
 *
 * REFUSED, NOT QUIETLY SWAPPED. An agent told "no" picks again and says so; one
 * whose model was silently changed reports work as having run on something it
 * did not, and the owner reads a number that does not match the transcript.
 *
 * MATCHED LOOSELY, ON PURPOSE. The same model arrives as `fable`,
 * `claude-fable-5` or `anthropic/claude-fable-5`, and an exact-match list is
 * defeated by the next spelling. A false positive costs one delegation a
 * cheaper model; a miss costs real money.
 *
 * KEPT IN STEP WITH THE DAEMON. `src-electron/orbit/daemon/model-policy.ts` in
 * the desktop app carries the same list and enforces the same rule on
 * `/v1/agents/run` — the two halves of one gate, in two repositories that
 * cannot import each other.
 */
import { WorkserError } from "./errors.js";

export interface BlockedModel {
  /** What to look for in the model string, lower-cased. */
  match: string;
  /** How it is named to a person. */
  label: string;
  /** Why it is refused, in one line. */
  reason: string;
}

export const DELEGATION_BLOCKED_MODELS: BlockedModel[] = [
  {
    match: "fable",
    label: "Claude Fable 5",
    reason:
      "it is the most expensive model available and no delegated run is worth it — ask the owner if you think this one is",
  },
];

/** The rule this model breaks, or `null`. Empty means "the agent's default". */
export function blockedDelegationModel(
  model: string | null | undefined,
): BlockedModel | null {
  const value = (model ?? "").trim().toLowerCase();
  if (!value) return null;
  return (
    DELEGATION_BLOCKED_MODELS.find((entry) => value.includes(entry.match)) ??
    null
  );
}

/**
 * Refuse an expensive model at the keyboard, where the agent can still choose
 * again — rather than at dispatch, minutes later, as a run that failed.
 */
export function assertDelegatableModel(
  flag: string,
  model: string | undefined,
): void {
  const blocked = blockedDelegationModel(model);
  if (!blocked || !model) return;
  throw new WorkserError(
    `${flag} "${model}" can't be chosen for a delegated run: ${blocked.reason}.\n` +
      `Pick another model, or leave ${flag} off to use the agent's own default.`,
    { code: "bad_request" },
  );
}
