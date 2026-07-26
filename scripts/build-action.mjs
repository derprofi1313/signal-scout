import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const outputDirectory = fileURLToPath(new URL("../dist/action/", import.meta.url));
const outputFile = fileURLToPath(new URL("../dist/action/index.cjs", import.meta.url));

await rm(outputDirectory, { recursive: true, force: true });
await build({
  entryPoints: ["src/action/index.ts"],
  outfile: outputFile,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  minifyWhitespace: true,
});

const bundle = await readFile(outputFile, "utf8");
await writeFile(outputFile, bundle.replace(/^[\t ]+$/gm, ""), "utf8");
