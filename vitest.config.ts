import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Each test file spawns the built CLI as a child process; give them room.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
