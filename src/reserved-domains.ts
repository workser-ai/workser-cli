/**
 * Domains an agent may never attach, and why the rule is code.
 *
 * An agent with domain access is one confused instruction away from pointing a
 * customer's app at a hostname the platform itself answers on. The damage is not
 * hypothetical: a Workser-controlled name serving a customer's app means anyone
 * who trusts the Workser brand is now trusting whatever that app does, and a
 * customer who has attached `app.workser.ai` can be lost only by taking it back
 * from them — which is a support conversation, not a rollback.
 *
 * So the rule lives here rather than in the prompt that asks the agent to be
 * careful. A prompt is advice; this is a refusal. The same reasoning as
 * `role-guard.ts`: an instruction the model can be talked out of is not a
 * control.
 *
 * Deliberately duplicated from any server-side list rather than fetched. A guard
 * that needs a network call fails open when the network is down, which is
 * exactly when a confused agent is most likely to be retrying.
 */

/**
 * Apex domains the platform owns. Every subdomain of these is covered too — the
 * check is suffix-based, because `anything.workser.ai` is as much ours as the
 * apex is.
 */
export const RESERVED_APEX = [
  "workser.ai",
  "workser.app",
  "workser.dev",
] as const;

/**
 * Hosts that belong to a platform we deploy ONTO. Attaching one is not a
 * security problem but it is always a mistake: these are assigned by the
 * provider, cannot be verified by DNS, and an agent that tries is misreading a
 * deployment URL as a domain to claim.
 */
export const PROVIDER_HOSTS = ["vercel.app", "neon.tech", "expo.dev"] as const;

export interface DomainVerdict {
  allowed: boolean;
  /** Said to the agent, and worth being specific: it will try to fix it. */
  reason?: string;
}

/**
 * Normalise before comparing. An agent that pastes `HTTPS://App.Workser.AI/`
 * out of a log is making the same request as one that types `app.workser.ai`,
 * and a check that misses the first is not a check.
 */
export function normaliseDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

/** True when `host` is `suffix` or any subdomain of it — never a substring. */
function isUnder(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

export function checkDomain(input: string): DomainVerdict {
  const host = normaliseDomain(input);

  if (!host) {
    return { allowed: false, reason: "No domain given." };
  }

  // Rejected before the reserved check so the error names the real problem: a
  // malformed host is a typo, not a policy refusal, and telling someone their
  // typo is "reserved" sends them to the wrong fix.
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
    return {
      allowed: false,
      reason: `"${input}" is not a valid domain name.`,
    };
  }

  for (const apex of RESERVED_APEX) {
    if (isUnder(host, apex)) {
      return {
        allowed: false,
        reason:
          `${host} belongs to Workser and cannot be attached to a project. ` +
          `Use a domain the customer owns. Workser's own preview and live ` +
          `addresses are assigned automatically — there is nothing to attach.`,
      };
    }
  }

  for (const provider of PROVIDER_HOSTS) {
    if (isUnder(host, provider)) {
      return {
        allowed: false,
        reason:
          `${host} is assigned by the hosting provider, not attached as a ` +
          `custom domain. If you were trying to find where this app is ` +
          `already served, read its URLs instead of adding a domain.`,
      };
    }
  }

  return { allowed: true };
}

/** Throws with the verdict's reason. For call sites that just need the gate. */
export function assertDomainAllowed(input: string): string {
  const verdict = checkDomain(input);
  if (!verdict.allowed) throw new Error(verdict.reason);
  return normaliseDomain(input);
}
