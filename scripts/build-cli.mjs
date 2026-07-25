import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const outputDirectory = fileURLToPath(new URL("../dist/cli/", import.meta.url));
const outputFile = fileURLToPath(new URL("../dist/cli/index.js", import.meta.url));

await rm(outputDirectory, { recursive: true, force: true });
await build({
  entryPoints: ["src/cli/index.ts"],
  outfile: outputFile,
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
