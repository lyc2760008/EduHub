// Run the smallest possible Playwright selection based on locally changed spec files.
import { execSync, spawnSync } from "node:child_process";

function resolveChangedSpecs() {
  // Use git status to capture staged, unstaged, and untracked spec changes.
  const output = execSync("git status --porcelain", { encoding: "utf8" });
  const specs = new Set<string>();

  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const status = line.slice(0, 2);
    // Skip deleted files so Playwright isn't asked to run missing specs.
    if (status.includes("D")) continue;
    const raw = line.slice(3).trim();
    const resolved = raw.includes("->")
      ? raw.split("->").pop()?.trim()
      : raw;
    if (!resolved) continue;
    if (
      resolved.endsWith(".spec.ts") &&
      resolved.replace(/\\/g, "/").startsWith("tests/e2e/")
    ) {
      specs.add(resolved);
    }
  }

  return Array.from(specs);
}

function runPlaywright(args: string[]) {
  // pnpm.cmd is required on Windows to resolve the pnpm executable.
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(command, ["exec", "playwright", "test", ...args], {
    stdio: "inherit",
  });
  if (typeof result.status === "number") {
    process.exit(result.status);
  }
  process.exit(1);
}

const changedSpecs = resolveChangedSpecs();

if (changedSpecs.length > 0) {
  runPlaywright(changedSpecs);
} else {
  // Default to the smoke project when no spec files are modified locally.
  runPlaywright(["--project=smoke-chromium"]);
}
