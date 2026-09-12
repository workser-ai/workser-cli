import { describe, expect, it } from "vitest";

import { withReconnect } from "../src/client";

const errno = (code: string) =>
  Object.assign(new Error(code), { code }) as NodeJS.ErrnoException;

/** No real waiting — the delays are policy, not something to sit through. */
const nosleep = async () => {};

/**
 * THE RED X ON A TASK THAT WAS WORKING.
 *
 * The daemon unlinks and recreates `~/.workser/orbit.sock` on every app
 * restart, and an agent turn outlives that. One attempt was all there was, so a
 * gap of a second became "Can't reach Workser Orbit. Is the app running?" — on
 * screen, inside the very app that was running.
 */
describe("a daemon that blinked", () => {
  it("succeeds once the socket comes back", async () => {
    let calls = 0;
    const result = await withReconnect(
      async () => {
        calls += 1;
        if (calls < 3) throw errno("ECONNREFUSED");
        return "ok";
      },
      "GET",
      nosleep,
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("gives up eventually rather than hanging forever", async () => {
    let calls = 0;
    await expect(
      withReconnect(
        async () => {
          calls += 1;
          throw errno("ECONNREFUSED");
        },
        "GET",
        nosleep,
      ),
    ).rejects.toThrow("ECONNREFUSED");
    // The original attempt plus one per delay — bounded, not infinite.
    expect(calls).toBe(5);
  });
});

/**
 * A RETRY IS ONLY SAFE IF THE FIRST ATTEMPT CANNOT HAVE BEEN ACTED ON.
 * This is the whole design, and getting it backwards would file artifacts and
 * create tasks twice.
 */
describe("what may be retried", () => {
  it("retries a POST when the connection never opened", async () => {
    // ECONNREFUSED / ENOENT mean nothing was sent, so nothing happened — safe
    // for any method, including the POSTs that create tasks.
    for (const code of ["ECONNREFUSED", "ENOENT", "EAGAIN"]) {
      let calls = 0;
      const out = await withReconnect(
        async () => {
          calls += 1;
          if (calls === 1) throw errno(code);
          return "ok";
        },
        "POST",
        nosleep,
      );
      expect(out, code).toBe("ok");
      expect(calls, code).toBe(2);
    }
  });

  it("does NOT retry a POST that may already have been delivered", async () => {
    // The socket opened and then broke: the daemon may have acted before dying.
    // Filing the same artifact twice is worse than telling the owner.
    let calls = 0;
    await expect(
      withReconnect(
        async () => {
          calls += 1;
          throw errno("ECONNRESET");
        },
        "POST",
        nosleep,
      ),
    ).rejects.toThrow("ECONNRESET");
    expect(calls).toBe(1);
  });

  it("does retry a GET that may already have been delivered", async () => {
    // A read is idempotent by definition, so a broken pipe costs nothing.
    let calls = 0;
    const out = await withReconnect(
      async () => {
        calls += 1;
        if (calls === 1) throw errno("ECONNRESET");
        return "ok";
      },
      "GET",
      nosleep,
    );
    expect(out).toBe("ok");
    expect(calls).toBe(2);
  });

  it("never retries something that is not a transport failure", async () => {
    // A bug in a command must surface immediately, not four times slower.
    let calls = 0;
    await expect(
      withReconnect(
        async () => {
          calls += 1;
          throw new TypeError("x is not a function");
        },
        "GET",
        nosleep,
      ),
    ).rejects.toThrow("x is not a function");
    expect(calls).toBe(1);
  });

  it("reads the errno out of a fetch wrapper too", async () => {
    // `fetch` hides the real code under `cause`; unix-socket errors arrive bare.
    let calls = 0;
    const out = await withReconnect(
      async () => {
        calls += 1;
        if (calls === 1) {
          throw Object.assign(new Error("fetch failed"), {
            cause: errno("ECONNREFUSED"),
          });
        }
        return "ok";
      },
      "GET",
      nosleep,
    );
    expect(out).toBe("ok");
    expect(calls).toBe(2);
  });
});
