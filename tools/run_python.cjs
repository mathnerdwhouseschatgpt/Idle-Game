const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: node tools/run_python.cjs <script.py> [...args]");
  process.exit(2);
}

const bundledPython = path.join(
  os.homedir(),
  ".cache",
  "codex-runtimes",
  "codex-primary-runtime",
  "dependencies",
  "python",
  "python.exe",
);

const candidates = [
  process.env.PYTHON ? { label: process.env.PYTHON, command: process.env.PYTHON, args: [] } : null,
  fs.existsSync(bundledPython) ? { label: bundledPython, command: bundledPython, args: [] } : null,
  { label: "python", command: "python", args: [] },
  { label: "python3", command: "python3", args: [] },
  { label: "py -3", command: "py", args: ["-3"] },
].filter(Boolean);

const failures = [];

for (const candidate of candidates) {
  const result = spawnSync(candidate.command, [...candidate.args, ...args], {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
    shell: false,
  });

  if (result.status === 0) {
    process.exit(0);
  }

  const reason = result.error ? result.error.message : `exit code ${result.status}`;
  failures.push(`${candidate.label}: ${reason}`);
}

console.error("Unable to run Python. Tried:");
for (const failure of failures) {
  console.error(`- ${failure}`);
}
process.exit(1);
