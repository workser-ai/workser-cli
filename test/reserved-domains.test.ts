import { describe, it, expect } from "vitest";
import {
  checkDomain,
  assertDomainAllowed,
  normaliseDomain,
} from "../src/reserved-domains.js";

describe("normaliseDomain", () => {
  it("strips scheme, path, port and trailing dot", () => {
    expect(normaliseDomain("HTTPS://App.Workser.AI/orders?x=1")).toBe(
      "app.workser.ai",
    );
    expect(normaliseDomain("shop.co.th:8080")).toBe("shop.co.th");
    expect(normaliseDomain("shop.co.th.")).toBe("shop.co.th");
  });
});

describe("checkDomain — Workser's own names", () => {
  it("refuses the apex and every subdomain", () => {
    for (const host of [
      "workser.ai",
      "app.workser.ai",
      "a.b.c.workser.ai",
      "workser.app",
      "workser.dev",
    ]) {
      expect(checkDomain(host).allowed, host).toBe(false);
    }
  });

  it("refuses however the agent writes it", () => {
    // A guard that only catches the tidy spelling is not a guard: an agent
    // pasting a URL out of a log is making the same request.
    expect(checkDomain("HTTPS://App.Workser.AI/").allowed).toBe(false);
    expect(checkDomain("  workser.ai  ").allowed).toBe(false);
  });

  it("does NOT refuse a lookalike that is a different owner's domain", () => {
    // Suffix, never substring. `notworser.ai` and `workser.ai.evil.com` are
    // other people's names; refusing them would be wrong in the other direction.
    expect(checkDomain("myworkser.ai").allowed).toBe(true);
    expect(checkDomain("workser.ai.example.com").allowed).toBe(true);
    expect(checkDomain("workserai.com").allowed).toBe(true);
  });

  it("explains what to do instead", () => {
    const reason = checkDomain("app.workser.ai").reason ?? "";
    expect(reason).toContain("assigned automatically");
  });
});

describe("checkDomain — provider hostnames", () => {
  it("refuses hosts the provider assigns", () => {
    expect(checkDomain("my-app.vercel.app").allowed).toBe(false);
    expect(checkDomain("ep-cool-1.neon.tech").allowed).toBe(false);
    expect(checkDomain("u.expo.dev").allowed).toBe(false);
  });

  it("points at reading URLs rather than adding a domain", () => {
    expect(checkDomain("my-app.vercel.app").reason).toContain("read its URLs");
  });
});

describe("checkDomain — ordinary customer domains", () => {
  it("allows what a customer would actually own", () => {
    for (const host of [
      "shop.co.th",
      "www.shop.co.th",
      "order.my-business.com",
      "xn--12c1bik6bbd.com",
    ]) {
      expect(checkDomain(host).allowed, host).toBe(true);
    }
  });
});

describe("checkDomain — malformed input", () => {
  it("names a typo as a typo, not as a policy refusal", () => {
    // Telling someone their typo is "reserved" sends them to the wrong fix.
    expect(checkDomain("not a domain").reason).toContain("not a valid");
    expect(checkDomain("localhost").reason).toContain("not a valid");
    expect(checkDomain("-bad.com").reason).toContain("not a valid");
    expect(checkDomain("").reason).toContain("No domain");
  });
});

describe("assertDomainAllowed", () => {
  it("returns the normalised host when allowed", () => {
    expect(assertDomainAllowed("HTTPS://Shop.CO.TH/")).toBe("shop.co.th");
  });

  it("throws with the reason when not", () => {
    expect(() => assertDomainAllowed("app.workser.ai")).toThrow(/belongs to Workser/);
  });
});
