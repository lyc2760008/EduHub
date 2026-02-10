// Repo-local generator for current state snapshot docs (no network calls).
// Produces docs/po/current-state.generated.md for PO planning reference.
import fs from "fs/promises";
import path from "path";

const REPO_ROOT = process.cwd();
const OUTPUT_PATH = path.join(REPO_ROOT, "docs", "po", "current-state.generated.md");
const APP_DIR_CANDIDATES = [
  path.join(REPO_ROOT, "app"),
  path.join(REPO_ROOT, "src", "app"),
];
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const IGNORE_DIRS = new Set([
  ".git",
  ".next",
  "node_modules",
  "playwright-report",
  "test-results",
  "coverage",
  "dist",
  "build",
]);
const NAV_KEYWORDS = ["ParentShell", "AdminShell", "navItems", "sidebar", "navigation"];

// Keep output paths stable across OS path separators.
function toPosixPath(inputPath) {
  return inputPath.split(path.sep).join("/");
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

// Walk the filesystem without following symlinks and skip known large folders.
async function walkFiles(rootDir) {
  const results = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    let entries = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) {
          stack.push(fullPath);
        }
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

function isRouteFile(filePath) {
  const fileName = path.basename(filePath);
  return (
    fileName === "page.tsx" ||
    fileName === "layout.tsx" ||
    fileName === "route.ts"
  );
}

function stripRouteGroup(segment) {
  return segment.startsWith("(") && segment.endsWith(")");
}

function deriveRoutePath(appDir, filePath) {
  const rel = path.relative(appDir, filePath);
  const segments = rel.split(path.sep);
  const fileName = segments.pop() ?? "";
  const cleanedSegments = segments.filter((segment) => !stripRouteGroup(segment));

  const routePath = cleanedSegments.length === 0 ? "/" : `/${cleanedSegments.join("/")}`;
  const type = fileName.replace(".tsx", "").replace(".ts", "");

  return {
    routePath,
    type,
    rawSegments: segments,
  };
}

function deriveRouteGroups(segments) {
  const normalizedSegments = segments.map((segment) =>
    segment.replace(/^\(|\)$/g, ""),
  );
  const segmentSet = new Set(normalizedSegments);
  const groups = new Set();

  if (segmentSet.has("admin")) {
    groups.add("admin");
  }
  if (segmentSet.has("parent") || segmentSet.has("portal")) {
    groups.add("parent");
  }
  if (segmentSet.has("parent-auth") || segmentSet.has("auth") || segmentSet.has("login")) {
    groups.add("auth");
  }
  if (segmentSet.has("api")) {
    groups.add("api");
  }

  return Array.from(groups).sort();
}

async function collectRoutes(appDirs) {
  const routes = [];

  for (const appDir of appDirs) {
    if (!(await pathExists(appDir))) continue;
    const files = await walkFiles(appDir);
    for (const filePath of files) {
      if (!isRouteFile(filePath)) continue;

      const info = deriveRoutePath(appDir, filePath);
      routes.push({
        appDir,
        filePath,
        routePath: info.routePath,
        type: info.type,
        groups: deriveRouteGroups(info.rawSegments),
      });
    }
  }

  return routes.sort((a, b) => a.routePath.localeCompare(b.routePath));
}

async function collectNavSources(rootDir) {
  const files = await walkFiles(rootDir);
  const candidates = files.filter((filePath) => {
    const ext = path.extname(filePath);
    if (!SCAN_EXTENSIONS.has(ext)) return false;
    return filePath.includes(`${path.sep}src${path.sep}`);
  });

  const sources = [];

  for (const filePath of candidates) {
    let content = "";
    try {
      content = await fs.readFile(filePath, "utf8");
    } catch {
      continue;
    }

    const matchedKeywords = NAV_KEYWORDS.filter((keyword) => content.includes(keyword));
    if (matchedKeywords.length > 0) {
      sources.push({
        filePath,
        keywords: matchedKeywords,
        navItems: extractNavItems(content),
      });
    }
  }

  return sources.sort((a, b) => a.filePath.localeCompare(b.filePath));
}

// Best-effort extraction of nav item href/labelKey pairs from simple object literals.
function extractNavItems(content) {
  const items = [];
  const objectRegex = /{[^{}]*}/g;
  let match;

  while ((match = objectRegex.exec(content)) !== null) {
    const block = match[0];
    if (!block.includes("href")) continue;

    const hrefMatch = block.match(/href:\s*`([^`]+)`|href:\s*\"([^\"]+)\"|href:\s*'([^']+)'/);
    const labelMatch = block.match(/labelKey:\s*`([^`]+)`|labelKey:\s*\"([^\"]+)\"|labelKey:\s*'([^']+)'/);
    const idMatch = block.match(/id:\s*`([^`]+)`|id:\s*\"([^\"]+)\"|id:\s*'([^']+)'/);
    const keyMatch = block.match(/key:\s*`([^`]+)`|key:\s*\"([^\"]+)\"|key:\s*'([^']+)'/);

    if (!hrefMatch) continue;

    const href = hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] ?? "";
    const labelKey = labelMatch ? labelMatch[1] ?? labelMatch[2] ?? labelMatch[3] ?? "" : "";
    const idOrKey = idMatch
      ? idMatch[1] ?? idMatch[2] ?? idMatch[3]
      : keyMatch
        ? keyMatch[1] ?? keyMatch[2] ?? keyMatch[3]
        : "";

    items.push({ href, labelKey, idOrKey });
  }

  return items;
}

async function collectPrismaModels(schemaPath) {
  if (!(await pathExists(schemaPath))) return [];
  const content = await fs.readFile(schemaPath, "utf8");
  const modelRegex = /model\s+(\w+)\s+{([\s\S]*?)}/g;
  const models = [];
  let match;

  while ((match = modelRegex.exec(content)) !== null) {
    const name = match[1];
    const body = match[2] ?? "";
    const hasTenantId = /^\s*tenantId\s+/m.test(body);
    models.push({ name, hasTenantId });
  }

  return models.sort((a, b) => a.name.localeCompare(b.name));
}

async function collectEnvVarNames(envPath) {
  if (!(await pathExists(envPath))) return [];
  const content = await fs.readFile(envPath, "utf8");
  const names = new Set();

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)\s*=/);
    if (match) {
      names.add(match[1]);
    }
  }

  return Array.from(names).sort();
}

async function collectPlaywrightTests(rootDir) {
  const candidates = [
    path.join(rootDir, "tests"),
    path.join(rootDir, "e2e"),
  ];
  const matches = [];

  for (const candidate of candidates) {
    if (!(await pathExists(candidate))) continue;
    const files = await walkFiles(candidate);
    for (const filePath of files) {
      const ext = path.extname(filePath);
      if (!SCAN_EXTENSIONS.has(ext)) continue;
      if (!/(\.spec\.|\.test\.)/.test(filePath)) continue;
      matches.push(filePath);
    }
  }

  return matches.sort((a, b) => a.localeCompare(b));
}

function formatTable(rows, headers) {
  const headerLine = `| ${headers.join(" | ")} |`;
  const dividerLine = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`);
  return [headerLine, dividerLine, ...body];
}

function summarizeDuplicates(navItems) {
  const hrefCounts = new Map();
  const labelCounts = new Map();

  for (const item of navItems) {
    if (item.href) {
      hrefCounts.set(item.href, (hrefCounts.get(item.href) ?? 0) + 1);
    }
    if (item.labelKey) {
      labelCounts.set(item.labelKey, (labelCounts.get(item.labelKey) ?? 0) + 1);
    }
  }

  const duplicates = [];
  for (const [href, count] of hrefCounts.entries()) {
    if (count > 1) {
      duplicates.push(`Duplicate href detected: ${href}`);
    }
  }
  for (const [labelKey, count] of labelCounts.entries()) {
    if (count > 1) {
      duplicates.push(`Duplicate labelKey detected: ${labelKey}`);
    }
  }

  return duplicates.sort();
}

async function main() {
  const appDirs = [];
  for (const candidate of APP_DIR_CANDIDATES) {
    if (await pathExists(candidate)) {
      appDirs.push(candidate);
    }
  }

  const routes = await collectRoutes(appDirs);
  const navSources = await collectNavSources(path.join(REPO_ROOT, "src"));
  const prismaModels = await collectPrismaModels(
    path.join(REPO_ROOT, "prisma", "schema.prisma"),
  );
  const envVarNames = await collectEnvVarNames(
    path.join(REPO_ROOT, ".env.example"),
  );
  const playwrightTests = await collectPlaywrightTests(REPO_ROOT);

  const navItems = navSources.flatMap((source) =>
    source.navItems.map((item) => ({ ...item, source: source.filePath })),
  );
  const duplicateNotes = summarizeDuplicates(navItems);

  const now = new Date();
  const generatedAt = now.toISOString();

  const lines = [];
  lines.push(`<!-- Generated by scripts/generate-current-state.mjs at ${generatedAt}. -->`);
  lines.push("# EduHub Current State Snapshot (Generated)");
  lines.push("");
  lines.push(`Generated at: ${generatedAt}`);
  lines.push("");
  lines.push("## App Directories");
  if (appDirs.length === 0) {
    lines.push("- TODO: manual fill (no app directories detected)");
  } else {
    for (const dir of appDirs) {
      lines.push(`- ${toPosixPath(path.relative(REPO_ROOT, dir))}`);
    }
  }

  lines.push("");
  lines.push("## Route Scan");
  if (routes.length === 0) {
    lines.push("- TODO: manual fill (no routes detected)");
  } else {
    const routeRows = routes.map((route) => [
      route.type,
      route.routePath,
      route.groups.join(", ") || "none",
      toPosixPath(path.relative(REPO_ROOT, route.filePath)),
    ]);
    lines.push(
      ...formatTable(routeRows, ["Type", "Route Path", "Groups", "File"]),
    );
  }

  lines.push("");
  lines.push("## Nav Sources (Keyword Scan)");
  if (navSources.length === 0) {
    lines.push("- TODO: manual fill (no nav sources detected)");
  } else {
    const sourceRows = navSources.map((source) => [
      toPosixPath(path.relative(REPO_ROOT, source.filePath)),
      source.keywords.join(", "),
    ]);
    lines.push(...formatTable(sourceRows, ["File", "Keywords"]));
  }

  lines.push("");
  lines.push("## Nav Items (Best-Effort)" );
  if (navItems.length === 0) {
    lines.push("- TODO: manual fill (no nav items parsed)");
  } else {
    const itemRows = navItems.map((item) => [
      toPosixPath(path.relative(REPO_ROOT, item.source)),
      item.labelKey || item.idOrKey || "TODO: label",
      item.href || "TODO: href",
    ]);
    lines.push(...formatTable(itemRows, ["Source", "LabelKey/Id", "Href"]));
  }

  lines.push("");
  lines.push("## Nav Notes" );
  if (duplicateNotes.length === 0) {
    lines.push("- No duplicates detected by the scanner.");
  } else {
    for (const note of duplicateNotes) {
      lines.push(`- ${note}`);
    }
  }

  lines.push("");
  lines.push("## Prisma Models (tenantId presence)" );
  if (prismaModels.length === 0) {
    lines.push("- TODO: manual fill (schema.prisma not found)");
  } else {
    const modelRows = prismaModels.map((model) => [
      model.name,
      model.hasTenantId ? "yes" : "no",
    ]);
    lines.push(...formatTable(modelRows, ["Model", "Has tenantId"]));
  }

  lines.push("");
  lines.push("## Playwright Tests" );
  if (playwrightTests.length === 0) {
    lines.push("- TODO: manual fill (no tests found)");
  } else {
    for (const testPath of playwrightTests) {
      lines.push(`- ${toPosixPath(path.relative(REPO_ROOT, testPath))}`);
    }
  }

  lines.push("");
  lines.push("## Env Var Names (from .env.example)" );
  if (envVarNames.length === 0) {
    lines.push("- TODO: manual fill (no env vars detected)");
  } else {
    for (const name of envVarNames) {
      lines.push(`- ${name}`);
    }
  }

  lines.push("");
  lines.push("## TODO: Manual Follow-ups" );
  lines.push("- Validate route descriptions, access control summaries, and i18n status.");
  lines.push("- Confirm nav labels and any duplicate/ambiguous items.");
  lines.push("- Verify test coverage summaries for PO planning.");

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${lines.join("\n")}\n`, "utf8");
}

main().catch((error) => {
  console.error("generate-current-state failed", error);
  process.exitCode = 1;
});
