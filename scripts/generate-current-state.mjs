// Repo-local generator for current state snapshot docs (no network calls).
// v2 captures route capabilities from @state annotations and code heuristics.
import fs from "fs/promises";
import path from "path";

const REPO_ROOT = process.cwd();
const OUTPUT_PATH = path.join(
  REPO_ROOT,
  "docs",
  "po",
  "current-state.generated.md",
);
const APP_DIR_CANDIDATES = [
  path.join(REPO_ROOT, "app"),
  path.join(REPO_ROOT, "src", "app"),
];
const SCAN_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);
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
const NAV_KEYWORDS = [
  "ParentShell",
  "AdminShell",
  "navItems",
  "sidebar",
  "navigation",
];
const ROUTE_FILE_NAMES = new Set(["page.tsx", "route.ts"]);
const SOURCE_SCAN_LIMIT = 12;

// Keep output paths stable across OS path separators.
function toPosixPath(inputPath) {
  return inputPath.split(path.sep).join("/");
}

function unique(items) {
  return Array.from(new Set(items));
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

function isStateRouteFile(filePath) {
  return ROUTE_FILE_NAMES.has(path.basename(filePath));
}

function stripRouteGroup(segment) {
  return segment.startsWith("(") && segment.endsWith(")");
}

function deriveRoutePath(appDir, filePath) {
  const rel = path.relative(appDir, filePath);
  const segments = rel.split(path.sep);
  const fileName = segments.pop() ?? "";
  const cleanedSegments = segments.filter((segment) => !stripRouteGroup(segment));
  const routePath =
    cleanedSegments.length === 0 ? "/" : `/${cleanedSegments.join("/")}`;
  const type = fileName.replace(".tsx", "").replace(".ts", "");
  return {
    routePath,
    type,
    rawSegments: segments,
  };
}

function deriveArea(segments) {
  const normalized = segments.map((segment) => segment.replace(/^\(|\)$/g, ""));
  const set = new Set(normalized);
  if (set.has("api")) return "api";
  if (set.has("admin")) return "admin";
  if (set.has("portal") || set.has("parent")) return "parent";
  if (set.has("auth") || set.has("login") || set.has("parent-auth")) return "auth";
  return "public";
}

function deriveEntity(routePath) {
  const staticSegments = routePath
    .split("/")
    .filter(Boolean)
    .filter((segment) => !segment.startsWith("["))
    .filter((segment) => segment !== "api" && segment !== "t");
  if (staticSegments.length === 0) return "resource";
  const last = staticSegments[staticSegments.length - 1];
  const normalized = last.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (normalized.endsWith("ies")) return `${normalized.slice(0, -3)}y`;
  if (normalized.endsWith("s") && normalized.length > 1) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function isDynamicDetailRoute(routePath) {
  return /\[[^/]+\]/.test(routePath);
}

function parseAnnotationField(header, fieldName) {
  const regex = new RegExp(`@state\\.${fieldName}\\s+([^\\n\\r*]+)`, "i");
  const match = header.match(regex);
  return match ? match[1].trim() : "";
}

// Parse the lightweight route annotation block from the first part of each route file.
function parseStateAnnotation(content) {
  const head = content.slice(0, 2000);
  if (!head.includes("@state.")) return null;

  const route = parseAnnotationField(head, "route");
  const area = parseAnnotationField(head, "area");
  const notes = parseAnnotationField(head, "notes");
  const capabilitiesRaw = parseAnnotationField(head, "capabilities");
  const capabilities = capabilitiesRaw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!route && !area && capabilities.length === 0 && !notes) return null;
  return { route, area, capabilities, notes };
}

function resolveImportPathCandidates(filePath, specifier) {
  const candidates = [];
  const roots = [];

  if (specifier.startsWith(".")) {
    roots.push(path.resolve(path.dirname(filePath), specifier));
  } else if (specifier.startsWith("@/")) {
    roots.push(path.join(REPO_ROOT, "src", specifier.slice(2)));
  } else {
    return candidates;
  }

  for (const root of roots) {
    candidates.push(root);
    for (const ext of SCAN_EXTENSIONS) {
      candidates.push(`${root}${ext}`);
      candidates.push(path.join(root, `index${ext}`));
    }
  }

  return unique(candidates);
}

async function collectHeuristicSources(routeFilePath, routeContent) {
  const sources = [{ filePath: routeFilePath, content: routeContent }];
  const imports = [];
  const importRegex = /from\s+["']([^"']+)["']/g;
  let match;
  while ((match = importRegex.exec(routeContent)) !== null) {
    imports.push(match[1]);
  }

  const candidatePaths = [];
  for (const specifier of imports) {
    candidatePaths.push(...resolveImportPathCandidates(routeFilePath, specifier));
  }

  // Include sibling files so modal/actions living next to page files are discoverable.
  try {
    const siblings = await fs.readdir(path.dirname(routeFilePath), {
      withFileTypes: true,
    });
    for (const sibling of siblings) {
      if (!sibling.isFile()) continue;
      if (!SCAN_EXTENSIONS.has(path.extname(sibling.name))) continue;
      candidatePaths.push(path.join(path.dirname(routeFilePath), sibling.name));
    }
  } catch {
    // Ignore directory read failures; route file itself remains sufficient fallback.
  }

  const loaded = new Set([routeFilePath]);
  for (const candidate of unique(candidatePaths)) {
    if (loaded.has(candidate)) continue;
    if (sources.length >= SOURCE_SCAN_LIMIT) break;
    if (!(await pathExists(candidate))) continue;
    try {
      const content = await fs.readFile(candidate, "utf8");
      sources.push({ filePath: candidate, content });
      loaded.add(candidate);
    } catch {
      // Ignore unreadable source files so doc generation remains resilient.
    }
  }

  return sources;
}

function addCapability(map, capability, evidence) {
  if (!capability) return;
  const normalized = capability.trim();
  if (!normalized) return;
  const entry = map.get(normalized) ?? {
    capability: normalized,
    inferred: true,
    evidence: new Set(),
  };
  if (evidence) {
    entry.evidence.add(evidence);
  }
  map.set(normalized, entry);
}

function inferFromHttpMethods(route, content, capabilityMap) {
  const methodRegex = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
  const methods = new Set();
  let match;
  while ((match = methodRegex.exec(content)) !== null) {
    methods.add(match[1]);
  }
  const entity = deriveEntity(route.routePath);

  for (const method of methods) {
    if (method === "GET") {
      addCapability(
        capabilityMap,
        isDynamicDetailRoute(route.routePath) ? "view:detail" : "view:list",
        `${toPosixPath(path.relative(REPO_ROOT, route.filePath))}:export ${method}`,
      );
    }
    if (method === "POST") {
      addCapability(
        capabilityMap,
        `create:${entity}`,
        `${toPosixPath(path.relative(REPO_ROOT, route.filePath))}:export ${method}`,
      );
    }
    if (method === "PUT" || method === "PATCH") {
      addCapability(
        capabilityMap,
        `update:${entity}`,
        `${toPosixPath(path.relative(REPO_ROOT, route.filePath))}:export ${method}`,
      );
    }
    if (method === "DELETE") {
      addCapability(
        capabilityMap,
        `delete:${entity}`,
        `${toPosixPath(path.relative(REPO_ROOT, route.filePath))}:export ${method}`,
      );
    }
  }
}

function inferFromSourcePatterns(route, source, capabilityMap) {
  const relFile = toPosixPath(path.relative(REPO_ROOT, source.filePath));
  const entity = deriveEntity(route.routePath);
  const patterns = [
    {
      regex: /method:\s*["'`]POST["'`]/i,
      capability: `create:${entity}`,
      evidence: "fetch:POST",
    },
    {
      regex: /method:\s*["'`](PUT|PATCH)["'`]/i,
      capability: `update:${entity}`,
      evidence: "fetch:PUT|PATCH",
    },
    {
      regex: /method:\s*["'`]DELETE["'`]/i,
      capability: `delete:${entity}`,
      evidence: "fetch:DELETE",
    },
    {
      regex: /<form[\s\S]*?(onSubmit|action)=/i,
      capability: "submit:form",
      evidence: "form-submit",
    },
    {
      regex: /\bprisma\.\w+\.(create|createMany|upsert)\b/,
      capability: `create:${entity}`,
      evidence: "prisma:create",
    },
    {
      regex: /\bprisma\.\w+\.(update|updateMany)\b/,
      capability: `update:${entity}`,
      evidence: "prisma:update",
    },
    {
      regex: /\bprisma\.\w+\.(delete|deleteMany)\b/,
      capability: `delete:${entity}`,
      evidence: "prisma:delete",
    },
    {
      regex: /\b(reportAbsence|portal\.absence\.cta\.report|absence request)\b/i,
      capability: "report_absence:create_request",
      evidence: "absence-report",
    },
    {
      regex: /\b(send-magic-link|send sign-in link|resend sign-in link|invite)\b/i,
      capability: "parent_invite:send_signin_link",
      evidence: "invite-action",
    },
    {
      regex: /\b(withdraw|resubmit)\b/i,
      capability: "request:status_change",
      evidence: "request-action",
    },
    {
      regex: /\b(create[A-Z]\w*|update[A-Z]\w*|delete[A-Z]\w*|submit[A-Z]\w*)\b/,
      capability: `update:${entity}`,
      evidence: "action-function",
    },
  ];

  for (const rule of patterns) {
    if (rule.regex.test(source.content)) {
      addCapability(capabilityMap, rule.capability, `${relFile}:${rule.evidence}`);
    }
  }
}

async function inferCapabilities(route, content) {
  const capabilityMap = new Map();
  const relFile = toPosixPath(path.relative(REPO_ROOT, route.filePath));

  // Base read capability is always added for page routes.
  if (route.type === "page") {
    addCapability(
      capabilityMap,
      isDynamicDetailRoute(route.routePath) ? "view:detail" : "view:list",
      `${relFile}:route-shape`,
    );
  }

  if (route.type === "route") {
    inferFromHttpMethods(route, content, capabilityMap);
  }

  const sources = await collectHeuristicSources(route.filePath, content);
  for (const source of sources) {
    inferFromSourcePatterns(route, source, capabilityMap);
  }

  return Array.from(capabilityMap.values()).sort((a, b) =>
    a.capability.localeCompare(b.capability),
  );
}

function mergeCapabilities(route, annotation, inferred) {
  const merged = [];
  const seen = new Set();
  const annotationCaps = annotation?.capabilities ?? [];
  const usableAnnotationCaps = annotationCaps.filter(
    (capability) => capability.toUpperCase() !== "UNKNOWN",
  );

  // Annotation capabilities are considered authoritative and not marked inferred.
  for (const capability of usableAnnotationCaps) {
    const normalized = capability.trim();
    if (!normalized || seen.has(normalized)) continue;
    merged.push({
      capability: normalized,
      inferred: false,
      evidence: [
        `${toPosixPath(path.relative(REPO_ROOT, route.filePath))}:@state.capabilities`,
      ],
    });
    seen.add(normalized);
  }

  // When annotation is missing or has only UNKNOWN, rely on heuristic inference.
  const needsHeuristicFallback =
    usableAnnotationCaps.length === 0 ||
    annotationCaps.some((capability) => capability.toUpperCase() === "UNKNOWN");

  if (needsHeuristicFallback) {
    for (const item of inferred) {
      if (seen.has(item.capability)) continue;
      merged.push({
        capability: item.capability,
        inferred: true,
        evidence: Array.from(item.evidence),
      });
      seen.add(item.capability);
    }
  }

  // Only emit UNKNOWN/TODO when annotation + heuristic both fail to determine capability.
  if (merged.length === 0) {
    merged.push({
      capability: "UNKNOWN/TODO",
      inferred: false,
      evidence: [
        `${toPosixPath(path.relative(REPO_ROOT, route.filePath))}:no-annotation-or-heuristic-match`,
      ],
    });
  }

  return merged;
}

function deriveRouteGroups(segments) {
  const normalizedSegments = segments.map((segment) =>
    segment.replace(/^\(|\)$/g, ""),
  );
  const segmentSet = new Set(normalizedSegments);
  const groups = new Set();
  if (segmentSet.has("admin")) groups.add("admin");
  if (segmentSet.has("parent") || segmentSet.has("portal")) groups.add("parent");
  if (segmentSet.has("parent-auth") || segmentSet.has("auth") || segmentSet.has("login")) {
    groups.add("auth");
  }
  if (segmentSet.has("api")) groups.add("api");
  return Array.from(groups).sort();
}

async function collectRoutes(appDirs) {
  const routes = [];
  for (const appDir of appDirs) {
    if (!(await pathExists(appDir))) continue;
    const files = await walkFiles(appDir);
    for (const filePath of files) {
      if (!isStateRouteFile(filePath)) continue;
      const info = deriveRoutePath(appDir, filePath);
      let content = "";
      try {
        content = await fs.readFile(filePath, "utf8");
      } catch {
        continue;
      }
      const annotation = parseStateAnnotation(content);
      const inferred = await inferCapabilities(
        {
          routePath: annotation?.route || info.routePath,
          type: info.type,
          filePath,
        },
        content,
      );
      const capabilities = mergeCapabilities(
        {
          routePath: annotation?.route || info.routePath,
          filePath,
        },
        annotation,
        inferred,
      );

      routes.push({
        appDir,
        filePath,
        routePath: annotation?.route || info.routePath,
        type: info.type,
        groups: deriveRouteGroups(info.rawSegments),
        area: annotation?.area || deriveArea(info.rawSegments),
        annotationNotes: annotation?.notes || "",
        capabilities,
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
    const matchedKeywords = NAV_KEYWORDS.filter((keyword) =>
      content.includes(keyword),
    );
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
    const hrefMatch = block.match(
      /href:\s*`([^`]+)`|href:\s*"([^"]+)"|href:\s*'([^']+)'/,
    );
    const labelMatch = block.match(
      /labelKey:\s*`([^`]+)`|labelKey:\s*"([^"]+)"|labelKey:\s*'([^']+)'/,
    );
    const idMatch = block.match(
      /id:\s*`([^`]+)`|id:\s*"([^"]+)"|id:\s*'([^']+)'/,
    );
    const keyMatch = block.match(
      /key:\s*`([^`]+)`|key:\s*"([^"]+)"|key:\s*'([^']+)'/,
    );
    if (!hrefMatch) continue;
    const href = hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] ?? "";
    const labelKey = labelMatch
      ? labelMatch[1] ?? labelMatch[2] ?? labelMatch[3] ?? ""
      : "";
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
  const candidates = [path.join(rootDir, "tests"), path.join(rootDir, "e2e")];
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
    if (count > 1) duplicates.push(`Duplicate href detected: ${href}`);
  }
  for (const [labelKey, count] of labelCounts.entries()) {
    if (count > 1) duplicates.push(`Duplicate labelKey detected: ${labelKey}`);
  }
  return duplicates.sort();
}

function formatCapabilityList(capabilities) {
  return capabilities
    .map((item) => `${item.capability}${item.inferred ? " (inferred)" : ""}`)
    .join("<br>");
}

function formatEvidenceList(capabilities) {
  const items = [];
  for (const capability of capabilities) {
    const evidence = capability.evidence.filter(Boolean);
    if (evidence.length === 0) continue;
    items.push(`${capability.capability} -> ${evidence.slice(0, 3).join(", ")}`);
  }
  return items.join("<br>");
}

async function main() {
  const appDirs = [];
  for (const candidate of APP_DIR_CANDIDATES) {
    if (await pathExists(candidate)) appDirs.push(candidate);
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

  const annotatedCount = routes.filter((route) =>
    route.capabilities.some((capability) => !capability.inferred),
  ).length;
  const unknownCount = routes.filter((route) =>
    route.capabilities.some((capability) => capability.capability === "UNKNOWN/TODO"),
  ).length;

  const lines = [];
  lines.push(`<!-- Generated by scripts/generate-current-state.mjs at ${generatedAt}. -->`);
  lines.push("# EduHub Current State Snapshot (Generated)");
  lines.push("");
  lines.push(`Generated at: ${generatedAt}`);
  lines.push("");
  lines.push("## Snapshot v2 Coverage");
  lines.push(`- Route files scanned: ${routes.length}`);
  lines.push(`- Routes with annotation-derived capabilities: ${annotatedCount}`);
  lines.push(`- Routes still marked UNKNOWN/TODO: ${unknownCount}`);
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
  lines.push("## Route Scan (Capabilities v2)");
  if (routes.length === 0) {
    lines.push("- TODO: manual fill (no routes detected)");
  } else {
    const routeRows = routes.map((route) => [
      route.type,
      route.routePath,
      route.area,
      formatCapabilityList(route.capabilities) || "UNKNOWN/TODO",
      formatEvidenceList(route.capabilities) || "TODO: add @state.capabilities",
      toPosixPath(path.relative(REPO_ROOT, route.filePath)),
    ]);
    lines.push(
      ...formatTable(routeRows, [
        "Type",
        "Route Path",
        "Area",
        "Capabilities",
        "Evidence",
        "File",
      ]),
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
  lines.push("## Nav Items (Best-Effort)");
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
  lines.push("## Nav Notes");
  if (duplicateNotes.length === 0) {
    lines.push("- No duplicates detected by the scanner.");
  } else {
    for (const note of duplicateNotes) {
      lines.push(`- ${note}`);
    }
  }

  lines.push("");
  lines.push("## Prisma Models (tenantId presence)");
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
  lines.push("## Playwright Tests");
  if (playwrightTests.length === 0) {
    lines.push("- TODO: manual fill (no tests found)");
  } else {
    for (const testPath of playwrightTests) {
      lines.push(`- ${toPosixPath(path.relative(REPO_ROOT, testPath))}`);
    }
  }

  lines.push("");
  lines.push("## Env Var Names (from .env.example)");
  if (envVarNames.length === 0) {
    lines.push("- TODO: manual fill (no env vars detected)");
  } else {
    for (const name of envVarNames) {
      lines.push(`- ${name}`);
    }
  }

  lines.push("");
  lines.push("## TODO: Manual Follow-ups");
  lines.push("- Fill @state.capabilities on UNKNOWN/TODO routes to reduce heuristic reliance.");
  lines.push("- Validate route capability wording in curated docs for PO planning.");
  lines.push("- Confirm nav labels and any duplicate/ambiguous items.");

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${lines.join("\n")}\n`, "utf8");
}

main().catch((error) => {
  console.error("generate-current-state failed", error);
  process.exitCode = 1;
});
