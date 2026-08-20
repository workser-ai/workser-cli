import { describe, expect, it } from "vitest";
import {
  bar,
  dimensionLine,
  fractionUsed,
  formatAmount,
  isUnlimited,
  shouldFail,
  usageState,
  usageSummary,
  type UsageDimension,
} from "../src/usage.js";

const dim = (over: Partial<UsageDimension> = {}): UsageDimension => ({
  id: "file_storage_gb",
  label: "Files",
  used: 1,
  unit: "GB",
  limit: 10,
  kind: "soft",
  ...over,
});

const report = (dimensions: UsageDimension[]) => ({ tier: "starter", dimensions });

describe("an unread figure is never a zero", () => {
  it("has no fraction, no bar and its own state", () => {
    const unknown = dim({ used: null, note: "Neon could not be reached" });
    expect(fractionUsed(unknown)).toBeNull();
    expect(usageState(unknown)).toBe("unknown");
    // An empty bar would read as "none used" — a claim nobody checked.
    expect(bar(unknown)).toBe("");
  });

  it("prints no number at all", () => {
    expect(dimensionLine(dim({ used: null, note: "x" }))).toBe(
      "Files: not measured — x",
    );
  });

  it("a measured zero is a real zero", () => {
    expect(fractionUsed(dim({ used: 0 }))).toBe(0);
    expect(usageState(dim({ used: 0 }))).toBe("fine");
    expect(bar(dim({ used: 0 }))).toBe("░".repeat(20));
  });
});

describe("soft and hard limits do not read the same", () => {
  it("over a soft allowance is billed, not broken", () => {
    expect(dimensionLine(dim({ used: 12 }))).toMatch(/billed as extra/);
  });

  it("over a hard cap says you are at the limit", () => {
    expect(
      dimensionLine(dim({ label: "Projects", used: 2, limit: 2, kind: "hard", unit: "count" })),
    ).toBe("Projects: 2 of 2 — at the limit");
  });

  it("only a hard cap fails the command", () => {
    // Failing a script because a customer got bigger and went over a BILLED
    // allowance would break their automation on the day they grew.
    expect(shouldFail(report([dim({ used: 99 })]))).toBe(false);
    expect(
      shouldFail(report([dim({ used: 2, limit: 2, kind: "hard", unit: "count" })])),
    ).toBe(true);
  });
});

describe("edges", () => {
  it("an unlimited dimension is never near or over", () => {
    expect(isUnlimited(Number.MAX_SAFE_INTEGER)).toBe(true);
    const d = dim({ used: 500, limit: Number.MAX_SAFE_INTEGER });
    expect(usageState(d)).toBe("fine");
    expect(bar(d)).toBe("");
    expect(dimensionLine(d)).toMatch(/no limit on this plan/);
  });

  it("a zero allowance is fully used the moment anything is stored", () => {
    expect(fractionUsed(dim({ used: 0.5, limit: 0 }))).toBe(1);
    expect(usageState(dim({ used: 0, limit: 0 }))).toBe("fine");
  });

  it("warns at 80%, while there is still time to act", () => {
    expect(usageState(dim({ used: 7.9 }))).toBe("fine");
    expect(usageState(dim({ used: 8 }))).toBe("near");
  });

  it("formats an amount the way a person says it", () => {
    expect(formatAmount(0.004, "GB")).toBe("<0.01 GB");
    // A limit is almost always whole. "10.0 GB" reads as precision we do not
    // have on the one figure that is exact.
    expect(formatAmount(10, "GB")).toBe("10 GB");
    expect(formatAmount(1.234, "GB")).toBe("1.23 GB");
    expect(formatAmount(123.45, "GB")).toBe("123.5 GB");
    expect(formatAmount(3.7, "count")).toBe("4");
  });
});

describe("usageSummary", () => {
  it("never says everything is fine INSTEAD of naming what failed", () => {
    const s = usageSummary(report([dim(), dim({ id: "db", used: null })]));
    expect(s).toMatch(/comfortably inside/);
    expect(s).toMatch(/1 figure could not be read/);
  });

  it("leads with over, then near", () => {
    expect(usageSummary(report([dim({ used: 12 })]))).toMatch(/over the starter plan/);
    expect(usageSummary(report([dim({ used: 9 })]))).toMatch(/close to/);
  });

  it("says so when there was nothing to measure", () => {
    expect(usageSummary(report([]))).toBe("Nothing could be measured.");
  });
});
