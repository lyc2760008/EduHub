// DevOps preflight checks for deployment readiness (versions + Edge runtime scan).
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const repoRoot = process.cwd();

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function tryCommand(command) {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function walkFiles(rootDir) {
  const results = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !fs.existsSync(current)) continue;

    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(current);
      for (const entry of entries) {
        const fullPath = path.join(current, entry);
        const entryStat = fs.statSync(fullPath);
        if (entryStat.isDirectory()) {
          if (["node_modules", ".next", ".git", "dist", "build"].includes(entry)) continue;
          stack.push(fullPath);
        } else {
          results.push(fullPath);
        }
      }
    } else {
      results.push(current);
    }
  }

  return results;
}

function formatPath(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

const packageJson = readJson(path.join(repoRoot, "package.json")) ?? {};
const nodeVersion = process.version;
const pnpmVersion = tryCommand("pnpm -v") ?? "not found";
const gitCommit = tryCommand("git rev-parse HEAD") ?? "unknown";
const nextVersion =
  packageJson?.dependencies?.next ?? packageJson?.devDependencies?.next ?? "unknown";
const prismaClientVersion =
  packageJson?.dependencies?.["@prisma/client"] ?? "unknown";
const prismaCliVersion = packageJson?.devDependencies?.prisma ?? "unknown";

console.log("DevOps preflight summary:");
console.log(`- Node: ${nodeVersion}`);
console.log(`- pnpm: ${pnpmVersion}`);
console.log(`- Next.js: ${nextVersion}`);
console.log(`- Prisma client: ${prismaClientVersion}`);
console.log(`- Prisma CLI: ${prismaCliVersion}`);
console.log(`- Git commit: ${gitCommit}`);

const edgeRuntimeRegex = /runtime\s*=\s*["']edge["']|runtime\s*:\s*["']edge["']/;
const prismaImportRegex =
  /@prisma\/client|@\/lib\/db\/prisma|generated\/prisma\/client|import\s+\{\s*prisma\s*\}/;
const codeRoots = ["src", "app"].filter((dir) => fs.existsSync(path.join(repoRoot, dir)));

const edgeRuntimeFiles = [];
const edgeRuntimeWithPrisma = [];

for (const root of codeRoots) {
  const files = walkFiles(path.join(repoRoot, root));
  for (const filePath of files) {
    if (!/\.(ts|tsx|js|mjs|cjs)$/.test(filePath)) continue;
    const contents = fs.readFileSync(filePath, "utf8");

    const hasEdgeRuntime = edgeRuntimeRegex.test(contents);
    if (hasEdgeRuntime) {
      const relative = formatPath(filePath);
      edgeRuntimeFiles.push(relative);
      if (prismaImportRegex.test(contents)) {
        edgeRuntimeWithPrisma.push(relative);
      }
    }
  }
}

const middlewareCandidates = [
  "middleware.ts",
  "middleware.tsx",
  "middleware.js",
  "middleware.mjs",
  "middleware.cjs",
].map((file) => path.join(repoRoot, file));

for (const filePath of middlewareCandidates) {
  if (!fs.existsSync(filePath)) continue;
  const contents = fs.readFileSync(filePath, "utf8");
  if (edgeRuntimeRegex.test(contents)) {
    const relative = formatPath(filePath);
    edgeRuntimeFiles.push(relative);
    if (prismaImportRegex.test(contents)) {
      edgeRuntimeWithPrisma.push(relative);
    }
  }
}

if (edgeRuntimeFiles.length > 0) {
  console.log("Edge runtime declarations detected:");
  for (const filePath of edgeRuntimeFiles) {
    console.log(`- ${filePath}`);
  }
} else {
  console.log("Edge runtime declarations detected: none");
}

if (edgeRuntimeWithPrisma.length > 0) {
  console.error(
    "Preflight failed: Edge runtime files importing Prisma were detected (must be nodejs).",
  );
  for (const filePath of edgeRuntimeWithPrisma) {
    console.error(`- ${filePath}`);
  }
  process.exit(1);
}
