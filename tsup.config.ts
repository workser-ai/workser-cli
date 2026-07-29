import { createRequire } from "node:module";
import { defineConfig } from "tsup";

const { version } = createRequire(import.meta.url)("./package.json") as {
  version: string;
};

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: false,
  dts: false,
  // Bundle ALL runtime deps (commander, picocolors, …) into a single
  // self-contained dist/index.js so the Orbit desktop connector can install
  // it as one file on the agent's PATH — runnable by system `node` from a
  // directory with NO node_modules.
  noExternal: [/.*/],
  // Inline the package version so the standalone file needs no package.json
  // alongside it at runtime.
  define: {
    __WORKSER_VERSION__: JSON.stringify(version),
  },
  banner: {
    // Shebang + a real `require` for the ESM bundle. commander is CommonJS,
    // so once inlined it must be able to `require()` Node built-ins (events,
    // util, …). Without this, esbuild's require shim throws "Dynamic require
    // of … is not supported" at runtime.
    js: [
      "#!/usr/bin/env node",
      "import { createRequire as __workserCreateRequire } from 'node:module';",
      "const require = __workserCreateRequire(import.meta.url);",
    ].join("\n"),
  },
});
