import { isDirectCliEntry, runCli } from "./index";

if (isDirectCliEntry(process.argv[1], import.meta.url)) {
  process.exitCode = await runCli(process.argv.slice(2));
}
