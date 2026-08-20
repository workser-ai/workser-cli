import { describe, expect, it } from "vitest";
import {
  addedLines,
  buildReport,
  depFindings,
  permissionFindings,
  scanSummary,
  secretFindings,
} from "../src/scan.js";

const DIFF = (body: string, file = "src/config.ts") =>
  [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -10,0 +11,1 @@`,
    ...body.split("\n").map((l) => `+${l}`),
  ].join("\n");

describe("addedLines", () => {
  it("numbers added lines from the hunk header, not from the top of the file", () => {
    // A finding pointing at the wrong line is one people dismiss as noise.
    const lines = addedLines(DIFF("const a = 1;\nconst b = 2;"));
    expect(lines.map((l) => l.line)).toEqual([11, 12]);
    expect(lines[0].file).toBe("src/config.ts");
  });

  it("ignores removals and the file they were removed from", () => {
    const diff = [
      "diff --git a/gone.ts b/gone.ts",
      "--- a/gone.ts",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-const KEY = 'sk-live-whatever';",
    ].join("\n");
    expect(addedLines(diff)).toEqual([]);
  });

  it("keeps context lines out of the results but counts them", () => {
    const diff = [
      "diff --git a/a.ts b/a.ts",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1,3 +1,4 @@",
      " const a = 1;",
      "+const b = 2;",
    ].join("\n");
    const lines = addedLines(diff);
    expect(lines).toHaveLength(1);
    expect(lines[0].line).toBe(2);
  });
});

describe("secretFindings", () => {
  it("catches the shapes that are actually credentials", () => {
    const cases = [
      "const k = 'AKIA2E0ZBQWX7T4KM3PQ';",
      "token: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789'",
      "STRIPE='sk_live_abcdefghijklmnop12345'",
      "DATABASE_URL=postgres://admin:hunter2hunter2@db.host/app",
      "-----BEGIN RSA PRIVATE KEY-----",
    ];
    for (const line of cases) {
      expect(secretFindings(DIFF(line)), line).toHaveLength(1);
    }
  });

  it("does not fire on the placeholder people are supposed to write", () => {
    const cases = [
      // AWS's own documentation key. Correctly shaped, and not a credential.
      "const k = 'AKIAIOSFODNN7EXAMPLE';",
      'API_KEY = "your-api-key-here"',
      'const password = "changeme12345"',
      'const secret = process.env.SESSION_SECRET',
      'apiKey: "<YOUR_KEY_HERE>"',
      'const token = `${process.env.TOKEN}`',
    ];
    for (const line of cases) {
      expect(secretFindings(DIFF(line)), line).toEqual([]);
    }
  });

  it("leaves example and fixture files alone", () => {
    // A credential-shaped string is the POINT of these files. Flagging them
    // punishes the correct way to document a setting.
    const key = "STRIPE_KEY=sk_live_abcdefghijklmnop12345";
    expect(secretFindings(DIFF(key, ".env.example"))).toEqual([]);
    expect(secretFindings(DIFF(key, "src/__tests__/fixtures/stripe.ts"))).toEqual([]);
    expect(secretFindings(DIFF(key, "package-lock.json"))).toEqual([]);
    expect(secretFindings(DIFF(key, "src/billing.ts"))).toHaveLength(1);
  });

  it("reports a file with six keys in it once, not six times", () => {
    const body = [
      "AWS=AKIA2E0ZBQWX7T4KM3PQ",
      "AWS2=AKIA2E0ZBQWX7T4KM3PR",
      "AWS3=AKIA2E0ZBQWX7T4KM3PS",
    ].join("\n");
    expect(secretFindings(DIFF(body))).toHaveLength(1);
  });

  it("says where, and says what to do", () => {
    const [finding] = secretFindings(DIFF("const k = 'AKIA2E0ZBQWX7T4KM3PQ';"));
    expect(finding.file).toBe("src/config.ts");
    expect(finding.line).toBe(11);
    expect(finding.severity).toBe("high");
    expect(finding.fix).toMatch(/workser env set/);
    // And it tells the truth about a key that is already committed.
    expect(finding.fix).toMatch(/leaked/);
  });
});

describe("depFindings", () => {
  const audit = (vulns: unknown) => JSON.stringify({ vulnerabilities: vulns });

  it("reports high and critical only", () => {
    const findings = depFindings(
      audit({
        lodash: { severity: "critical", isDirect: true, fixAvailable: true },
        chalk: { severity: "low", isDirect: true, fixAvailable: true },
        minimist: { severity: "moderate", isDirect: false },
      }),
    );
    expect(findings.map((f) => f.title)).toEqual([
      "lodash has a known critical security problem",
    ]);
  });

  it("says when the fix is a breaking change rather than pretending it is easy", () => {
    const [finding] = depFindings(
      audit({
        next: {
          severity: "high",
          isDirect: true,
          fixAvailable: { name: "next", version: "15.0.0", isSemVerMajor: true },
        },
      }),
    );
    expect(finding.fix).toMatch(/breaking change/);
  });

  it("says when there is no fix at all", () => {
    const [finding] = depFindings(
      audit({ thing: { severity: "high", isDirect: true, fixAvailable: false } }),
    );
    expect(finding.fix).toMatch(/no published fix/);
  });

  it("treats unreadable npm output as nothing found, never as a crash", () => {
    expect(depFindings("not json")).toEqual([]);
    expect(depFindings(null)).toEqual([]);
    expect(depFindings(JSON.stringify({}))).toEqual([]);
  });
});

describe("permissionFindings", () => {
  it("catches a secret compiled into the browser bundle", () => {
    const findings = permissionFindings([
      { path: "src/app/page.tsx", content: "const k = process.env.NEXT_PUBLIC_STRIPE_SECRET_KEY;" },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toMatch(/NEXT_PUBLIC_STRIPE_SECRET_KEY/);
    expect(findings[0].fix).toMatch(/server only/);
  });

  it("leaves an ordinary NEXT_PUBLIC_ setting alone", () => {
    expect(
      permissionFindings([
        { path: "src/app/page.tsx", content: "process.env.NEXT_PUBLIC_SITE_URL" },
      ]),
    ).toEqual([]);
  });

  it("only flags wide-open CORS when credentials are also sent", () => {
    // `*` alone is how a public read-only API is supposed to be configured.
    const open = { path: "api/index.ts", content: `{"Access-Control-Allow-Origin": "*"}` };
    expect(permissionFindings([open])).toEqual([]);
    const withCreds = {
      path: "api/index.ts",
      content: `{"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Credentials": "true"}`,
    };
    expect(permissionFindings([withCreds])).toHaveLength(1);
  });

  it("flags a real .env in the repository, and not the example", () => {
    const findings = permissionFindings(
      [],
      [".env", ".env.local", ".env.example", "src/app.ts"],
    );
    expect(findings.map((f) => f.file)).toEqual([".env", ".env.local"]);
  });
});

describe("the report itself", () => {
  it("names what ran, so nothing-found cannot be confused with nothing-checked", () => {
    const clean = buildReport({
      findings: [],
      checked: ["deps", "secrets", "permissions"],
      skipped: [],
    });
    expect(scanSummary(clean)).toBe("Checked deps, secrets, permissions — nothing found.");
    expect(clean.ok).toBe(true);
  });

  it("says outright when nothing could be checked", () => {
    const none = buildReport({
      findings: [],
      checked: [],
      skipped: [{ check: "deps", reason: "no network" }],
    });
    expect(scanSummary(none)).toMatch(/Nothing could be checked/);
  });

  it("fails only on something serious, and counts the rest", () => {
    const report = buildReport({
      findings: [
        { check: "deps", severity: "low", title: "b", fix: "" },
        { check: "secrets", severity: "high", title: "a", fix: "" },
      ],
      checked: ["deps", "secrets"],
      skipped: [],
    });
    expect(report.ok).toBe(false);
    expect(report.counts).toEqual({ high: 1, medium: 0, low: 1 });
    // Worst first: the serious one must not be below the minor one.
    expect(report.findings[0].severity).toBe("high");
    expect(scanSummary(report)).toMatch(/2 things to look at, 1 of them serious/);
  });
});
