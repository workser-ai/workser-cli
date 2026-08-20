import { describe, expect, it } from "vitest";
import {
  SPEC_FILES,
  discoverRoutes,
  specPaths,
  specReport,
  specSummary,
} from "../src/api-spec.js";

describe("discoverRoutes — Next.js App Router", () => {
  it("maps a route file to the path it serves", () => {
    expect(discoverRoutes(["app/api/orders/route.ts"])).toEqual([
      { path: "/api/orders", file: "app/api/orders/route.ts" },
    ]);
  });

  it("writes dynamic segments the way a spec does", () => {
    expect(discoverRoutes(["app/api/orders/[id]/route.ts"])[0].path).toBe(
      "/api/orders/{id}",
    );
    expect(discoverRoutes(["app/api/files/[...path]/route.ts"])[0].path).toBe(
      "/api/files/{path}",
    );
  });

  it("drops route groups, which never appear in a URL", () => {
    expect(discoverRoutes(["app/(internal)/api/jobs/route.ts"])[0].path).toBe(
      "/api/jobs",
    );
  });

  it("accepts js and tsx spellings, and the root route", () => {
    expect(discoverRoutes(["app/api/a/route.js"])[0].path).toBe("/api/a");
    expect(discoverRoutes(["app/route.ts"])[0].path).toBe("/");
  });

  it("ignores files that are not routes", () => {
    expect(
      discoverRoutes(["app/api/orders/helpers.ts", "app/page.tsx", "README.md"]),
    ).toEqual([]);
  });
});

describe("discoverRoutes — Vercel Python", () => {
  it("maps api/*.py to its path", () => {
    expect(discoverRoutes(["api/orders.py"])[0].path).toBe("/api/orders");
  });

  it("treats index as the directory itself", () => {
    expect(discoverRoutes(["api/index.py"])[0].path).toBe("/api");
    expect(discoverRoutes(["api/reports/index.py"])[0].path).toBe("/api/reports");
  });
});

describe("discoverRoutes", () => {
  it("deduplicates and sorts, so the report is stable", () => {
    const routes = discoverRoutes([
      "app/api/z/route.ts",
      "app/api/a/route.ts",
      "./app/api/a/route.ts",
    ]);
    expect(routes.map((r) => r.path)).toEqual(["/api/a", "/api/z"]);
  });
});

describe("specPaths", () => {
  it("reads a JSON document", () => {
    expect(
      specPaths(JSON.stringify({ paths: { "/api/orders": {}, "/api/health": {} } })),
    ).toEqual(["/api/health", "/api/orders"]);
  });

  it("reads the path keys out of YAML", () => {
    const yaml = [
      "openapi: 3.1.0",
      "info:",
      "  title: Orders",
      "paths:",
      "  /api/orders:",
      "    get:",
      "      summary: List them",
      "  '/api/orders/{id}':",
      "    get: {}",
      "components:",
      "  schemas: {}",
    ].join("\n");
    expect(specPaths(yaml)).toEqual(["/api/orders", "/api/orders/{id}"]);
  });

  it("stops at the end of the paths block", () => {
    const yaml = ["paths:", "  /a:", "    get: {}", "tags:", "  - name: x"].join("\n");
    expect(specPaths(yaml)).toEqual(["/a"]);
  });

  it("returns nothing rather than throwing on rubbish", () => {
    expect(specPaths("{ not json")).toEqual([]);
    expect(specPaths("")).toEqual([]);
    expect(specPaths(null)).toEqual([]);
    expect(specPaths(JSON.stringify({ openapi: "3.1.0" }))).toEqual([]);
  });
});

describe("specReport", () => {
  const routes = discoverRoutes([
    "app/api/orders/route.ts",
    "app/api/orders/[id]/route.ts",
    "app/api/health/route.ts",
  ]);

  it("passes when every route is described", () => {
    const report = specReport(routes, ["/api/orders", "/api/orders/{id}"]);
    expect(report.ok).toBe(true);
    expect(report.missing).toEqual([]);
  });

  it("fails, and names the route and the file", () => {
    const report = specReport(routes, ["/api/orders"]);
    expect(report.ok).toBe(false);
    expect(report.missing.map((m) => m.path)).toEqual(["/api/orders/{id}"]);
    expect(report.missing[0].file).toBe("app/api/orders/[id]/route.ts");
  });

  it("does not require a spec entry for a health probe", () => {
    expect(specReport(routes, ["/api/orders", "/api/orders/{id}"]).ok).toBe(true);
  });

  it("reports a stale entry WITHOUT failing on it", () => {
    const report = specReport(routes, [
      "/api/orders",
      "/api/orders/{id}",
      "/api/gone",
    ]);
    expect(report.stale).toEqual(["/api/gone"]);
    expect(report.ok).toBe(true);
  });
});

describe("specSummary", () => {
  const routes = discoverRoutes(["app/api/orders/route.ts"]);

  it("says where to write the spec when there is none", () => {
    expect(specSummary(specReport(routes, []), null)).toContain(SPEC_FILES[0]);
  });

  it("names the gaps", () => {
    expect(specSummary(specReport(routes, []), "openapi.json")).toContain(
      "/api/orders",
    );
  });

  it("stays grammatical at one route and at several", () => {
    expect(specSummary(specReport(routes, ["/api/orders"]), "openapi.json")).toBe(
      "The one route this service has is described in openapi.json.",
    );
    const two = discoverRoutes(["app/api/a/route.ts", "app/api/b/route.ts"]);
    expect(specSummary(specReport(two, ["/api/a", "/api/b"]), "openapi.json")).toBe(
      "All 2 routes are described in openapi.json.",
    );
  });
});
