import { describe, expect, it } from "vitest";
import {
  ENVIRONMENTS,
  envTargets,
  parseDeployEnvironment,
  parseEnvironment,
  targetSummary,
  urlRows,
  urlsSummary,
} from "../src/environments.js";

describe("parseEnvironment", () => {
  it("accepts what people and agents actually type", () => {
    for (const [input, expected] of [
      ["prod", "production"],
      ["PRODUCTION", "production"],
      ["  live  ", "production"],
      ["main", "production"],
      ["dev", "development"],
      ["staging", "preview"],
      ["preview", "preview"],
    ] as const) {
      expect(parseEnvironment(input).value, input).toBe(expected);
    }
  });

  it("no flag is not an error — it means every environment", () => {
    expect(parseEnvironment(undefined)).toEqual({ ok: true });
    expect(parseEnvironment("")).toEqual({ ok: true });
  });

  it("refuses a word it does not know, and names the ones it does", () => {
    const parsed = parseEnvironment("qa");
    expect(parsed.ok).toBe(false);
    for (const env of ENVIRONMENTS) expect(parsed.error).toContain(env);
  });
});

describe("parseDeployEnvironment", () => {
  it("refuses development, and says why rather than 'invalid'", () => {
    // Nothing is ever BUILT into development — it is the local target. Mapping
    // it silently to preview would show someone a different environment than
    // the one they asked about and tell them nothing.
    const parsed = parseDeployEnvironment("dev", "deploy");
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/Nothing is ever deployed to development/);
    expect(parsed.error).toMatch(/deploy/);
  });

  it("passes the two that exist through unchanged", () => {
    expect(parseDeployEnvironment("prod", "logs").value).toBe("production");
    expect(parseDeployEnvironment("preview", "logs").value).toBe("preview");
    expect(parseDeployEnvironment(undefined, "logs")).toEqual({ ok: true });
  });
});

describe("envTargets", () => {
  it("writes to all three when no environment is named", () => {
    // The default this command has always had. Narrowing it would have
    // un-set production for every existing script on the day it shipped.
    expect(envTargets()).toEqual(["development", "preview", "production"]);
  });

  it("pairs preview with development, and leaves production alone", () => {
    expect(envTargets("preview")).toEqual(["preview", "development"]);
    expect(envTargets("production")).toEqual(["production"]);
    expect(envTargets("development")).toEqual(["development"]);
  });

  it("says back what it did, in those terms", () => {
    expect(targetSummary()).toBe("in every environment");
    expect(targetSummary("preview")).toBe("in preview and development");
    expect(targetSummary("production")).toBe("in production");
  });
});

describe("urlRows", () => {
  const app = {
    id: "a_1",
    name: "Shop",
    previewUrl: "https://preview.shop.workser.app",
    productionUrl: "https://shop.example",
    previewDeploymentUrl: "https://abc123.vercel.app",
    productionDeploymentUrl: "https://def456.vercel.app",
  };

  it("returns the stable hosts and never the per-deployment ones", () => {
    // The ephemeral host is retired by the next deploy. Handing it over as
    // "your preview URL" is what produced "the URL changes every time".
    const rows = urlRows([app]);
    // Preview first, production second — the order work actually moves in.
    expect(rows.map((r) => r.url)).toEqual([
      "https://preview.shop.workser.app",
      "https://shop.example",
    ]);
    expect(rows.every((r) => !r.url?.includes("vercel.app"))).toBe(true);
  });

  it("does not fall back to the ephemeral host when the stable one is missing", () => {
    const rows = urlRows([{ id: "a_1", name: "Shop", productionDeploymentUrl: "https://x.vercel.app" }]);
    expect(rows.every((r) => r.url === null)).toBe(true);
  });

  it("says why there is no URL, and what to run", () => {
    const rows = urlRows([{ id: "a_1", name: "New app" }]);
    expect(rows[0].note).toMatch(/no preview yet/);
    expect(rows[1].note).toMatch(/workser deploy --env production/);
  });

  it("skips a row with no id, and names an app with no name", () => {
    const rows = urlRows([{ name: "no id" }, { id: "a_2" }]);
    expect(rows).toHaveLength(2);
    expect(rows[0].appName).toBe("Untitled app");
  });
});

describe("urlsSummary", () => {
  it("counts apps, not rows, and never reads 'live' when nothing is", () => {
    expect(urlsSummary([])).toMatch(/no apps yet/);
    expect(urlsSummary(urlRows([{ id: "a", name: "A" }]))).toBe("1 app, none live yet.");
    expect(
      urlsSummary(urlRows([{ id: "a", name: "A", productionUrl: "https://a" }])),
    ).toBe("1 app — 1 live.");
  });
});
