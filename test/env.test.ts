import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCli } from "./run-cli.js";

/**
 * `$WORKSER_ENV` picks the backend the CLI talks to when it is not going
 * through a local Orbit daemon. These run `doctor`, which resolves the whole
 * chain and makes no network call — so the assertions are about resolution,
 * not about any environment being reachable.
 */
let home: string;

/** doctor --json with no session on disk and a clean environment. */
function doctor(env: Record<string, string> = {}, home_ = home) {
  return runCli(["--json", "doctor"], { home: home_, env });
}

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "workser-env-home-"));
});

afterAll(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("WORKSER_ENV", () => {
  it("defaults to prod when unset", async () => {
    const r = await doctor();
    expect(r.json.data.env).toBe("prod");
    expect(r.json.data.endpoint).toBe("https://api.workser.ai");
  });

  it("maps dev to dev-api", async () => {
    const r = await doctor({ WORKSER_ENV: "dev" });
    expect(r.json.data.env).toBe("dev");
    expect(r.json.data.endpoint).toBe("https://dev-api.workser.ai");
  });

  it("maps local to a locally-run core-api", async () => {
    const r = await doctor({ WORKSER_ENV: "local" });
    expect(r.json.data.env).toBe("local");
    expect(r.json.data.endpoint).toBe("http://localhost:8000");
  });

  it("accepts the obvious aliases", async () => {
    expect((await doctor({ WORKSER_ENV: "production" })).json.data.env).toBe("prod");
    expect((await doctor({ WORKSER_ENV: "development" })).json.data.env).toBe("dev");
    expect((await doctor({ WORKSER_ENV: "DEV" })).json.data.env).toBe("dev");
  });

  // The whole point of the switch: a typo must not quietly resolve to prod and
  // let a `deploy` land on production.
  it("rejects an unknown value instead of falling back", async () => {
    const r = await doctor({ WORKSER_ENV: "devv" });
    expect(r.code).not.toBe(0);
    expect(r.json.ok).toBe(false);
    expect(r.json.error.code).toBe("bad_env");
  });

  it("yields to $WORKSER_API_URL, which names an exact URL", async () => {
    const r = await doctor({
      WORKSER_ENV: "dev",
      WORKSER_API_URL: "https://pr-42.workser.dev",
    });
    expect(r.json.data.endpoint).toBe("https://pr-42.workser.dev");
    expect(r.json.data.env).toBe("dev");
  });

  it("yields to a saved session, and says so", async () => {
    // The session token was minted against its endpoint; honouring the env var
    // over it would just 401. doctor has to surface that rather than let the
    // user believe they switched.
    const sessionHome = mkdtempSync(join(tmpdir(), "workser-env-session-"));
    mkdirSync(join(sessionHome, ".workser"), { recursive: true });
    writeFileSync(
      join(sessionHome, ".workser", "session.json"),
      JSON.stringify({ endpoint: "https://api.workser.ai", token: "tok_abcdef123456" }),
    );

    const r = await doctor({ WORKSER_ENV: "dev" }, sessionHome);
    expect(r.json.data.endpoint).toBe("https://api.workser.ai");
    expect(r.json.data.env).toBe("dev");
    expect(r.json.data.envIgnored).toBe(true);

    rmSync(sessionHome, { recursive: true, force: true });
  });
});
