/**
 * Turning a usage report into lines someone acts on.
 *
 * A second copy of the wording that also exists in core-api's
 * `usage-report.ts`, and deliberately so — the same reason `role-guard.ts` and
 * `board.ts` keep their own lists. This CLI has no build-time dependency on the
 * service's source. If one changes, change both; the failure mode is a sentence
 * that reads slightly differently in two places, which is cheap.
 *
 * THE ONE RULE, and it is the reason this module exists at all: a figure that
 * could not be READ must never render as a number. `used: null` is a state, not
 * a zero. "0 GB of 10" tells someone they have room when nobody looked, and it
 * is the most damaging thing a usage report can say.
 */

export type UsageUnit = 'GB' | 'count';
export type UsageKind = 'hard' | 'soft' | 'none';
export type UsageState = 'unknown' | 'fine' | 'near' | 'over';

export interface UsageDimension {
  id: string;
  label: string;
  /** null means NOT MEASURED. Never treat it as zero. */
  used: number | null;
  unit: UsageUnit;
  limit: number | null;
  kind: UsageKind;
  note?: string;
}

export interface UsageReport {
  projectId?: string;
  tier: string;
  dimensions: UsageDimension[];
  complete?: boolean;
}

/** Anything at or above this share of the allowance is worth saying. */
export const NEAR_LIMIT_FRACTION = 0.8;

export function isUnlimited(limit: number | null | undefined): boolean {
  return (
    limit === null ||
    limit === undefined ||
    !Number.isFinite(limit) ||
    limit >= Number.MAX_SAFE_INTEGER
  );
}

export function fractionUsed(d: UsageDimension): number | null {
  if (d.used === null) return null;
  if (isUnlimited(d.limit)) return null;
  const limit = d.limit as number;
  // A zero allowance with anything against it is fully used, not undefined:
  // some plans include no file storage at all.
  if (limit <= 0) return d.used > 0 ? 1 : 0;
  return d.used / limit;
}

export function usageState(d: UsageDimension): UsageState {
  if (d.used === null) return 'unknown';
  const fraction = fractionUsed(d);
  if (fraction === null) return 'fine';
  if (fraction >= 1) return 'over';
  if (fraction >= NEAR_LIMIT_FRACTION) return 'near';
  return 'fine';
}

export function formatAmount(value: number, unit: UsageUnit): string {
  if (unit === 'count') return String(Math.round(value));
  // A whole number keeps no decimals: a LIMIT is almost always whole, and
  // '10.0 GB' beside '2.50 GB' reads as spurious precision on the one figure
  // that is exact.
  if (Number.isInteger(value)) return `${value} GB`;
  if (value < 0.01) return '<0.01 GB';
  if (value < 10) return `${value.toFixed(2)} GB`;
  return `${value.toFixed(1)} GB`;
}

/**
 * A twenty-cell bar, or nothing.
 *
 * Returns an empty string for an unmeasured or unlimited dimension. An empty
 * bar would read as "none used", which for an unmeasured figure is a claim
 * nobody checked.
 */
export function bar(d: UsageDimension, width = 20): string {
  const fraction = fractionUsed(d);
  if (fraction === null) return '';
  const filled = Math.min(width, Math.round(fraction * width));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/** One line for one dimension, with no colour in it. */
export function dimensionLine(d: UsageDimension): string {
  if (d.used === null) {
    return `${d.label}: not measured${d.note ? ` — ${d.note}` : ''}`;
  }
  const used = formatAmount(d.used, d.unit);
  if (isUnlimited(d.limit)) return `${d.label}: ${used} (no limit on this plan)`;

  const limit = formatAmount(d.limit as number, d.unit);
  if (usageState(d) === 'over') {
    // A soft limit that is exceeded is BILLED, not blocked. Saying "at the
    // limit" about it would tell someone their storage stopped working.
    return d.kind === 'hard'
      ? `${d.label}: ${used} of ${limit} — at the limit`
      : `${d.label}: ${used} of ${limit} included — the rest is billed as extra`;
  }
  return `${d.label}: ${used} of ${limit}`;
}

/**
 * The headline.
 *
 * Says what could not be read alongside anything reassuring, never instead of
 * it: "everything is comfortable" over a failed measurement is the sentence
 * this whole module is shaped against.
 */
export function usageSummary(report: UsageReport): string {
  const dims = report.dimensions ?? [];
  const unknown = dims.filter((d) => d.used === null);
  const over = dims.filter((d) => usageState(d) === 'over');
  const near = dims.filter((d) => usageState(d) === 'near');

  const parts: string[] = [];
  if (over.length) {
    parts.push(
      `${over.length === 1 ? 'One thing is' : `${over.length} things are`} over the ${report.tier} plan's limit`,
    );
  } else if (near.length) {
    parts.push(
      `${near.length === 1 ? 'One thing is' : `${near.length} things are`} close to the ${report.tier} plan's limit`,
    );
  } else if (dims.some((d) => d.used !== null)) {
    parts.push(`Everything is comfortably inside the ${report.tier} plan`);
  }
  if (unknown.length) {
    parts.push(
      `${unknown.length} ${unknown.length === 1 ? 'figure' : 'figures'} could not be read`,
    );
  }
  if (!parts.length) return 'Nothing could be measured.';
  return `${parts.join('; ')}.`;
}

/** Exit non-zero only for a HARD cap that is reached. See the command. */
export function shouldFail(report: UsageReport): boolean {
  return (report.dimensions ?? []).some(
    (d) => d.kind === 'hard' && usageState(d) === 'over',
  );
}
