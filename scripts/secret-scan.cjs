#!/usr/bin/env node
/**
 * Lightweight repository secret scan (CLP-00-02 verification).
 *
 * Scans tracked project files for common secret patterns and forbidden
 * domain/feature files. Exits non-zero on any finding. No network, no
 * dependencies.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.vite', 'tmp']);

const PATTERNS = [
  { name: 'private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'aws access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'google api key', re: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
  { name: 'openai-style key', re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: 'github token', re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { name: 'slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  {
    name: 'hardcoded secret assignment',
    re: /(?:password|passwd|secret|token|apikey|api_key|session_secret|csrf_secret)\s*[:=]\s*['"][^'"{}\s][^'"]{5,}['"]/i,
  },
];

// Files/globs that may legitimately contain the word "password" etc.
const ALLOWLIST_FILES = new Set(['.env.example', 'compose.yaml']);

// CLP-00-04 foundation artifacts that are now expected to exist. They are no
// longer "forbidden CP-01+ artifacts" — but they are still scanned for secrets
// AND cross-checked (see FORBIDDEN_PRISMA_MODEL / domain-table checks below).
const ALLOWED_PRISMA_PATHS = [
  /(^|[/\\])prisma[/\\]schema\.prisma$/i,
  /(^|[/\\])prisma[/\\]migrations[/\\]/i,
];

// CLP-00-04: domain/model markers are enforced structurally below — the schema
// must declare no models and migrations must not CREATE TABLE. No term list is
// needed because any model or table at all is forbidden in CP-00.

// Test files that intentionally contain SYNTHETIC fixtures for the config
// boundary (CLP-00-03). These must never hold real values; the scanner still
// checks them for high-signal patterns (keys, tokens) — only the generic
// "hardcoded secret assignment" heuristic is relaxed.
const ALLOWLIST_TEST_FILES = new Set([
  'apps/api/test/protected/config.spec.ts',
  'apps/api/test/protected/spa-config.spec.ts',
  'apps/api/test/protected/health.e2e-spec.ts',
  'apps/api/test/protected/test-harness.spec.ts',
  'apps/api/test/support/factories.ts',
]);

// Forbidden CP-01+ artifacts (should not exist in this skeleton).
// NOTE: `prisma/` + `schema.prisma` + `migrations/` are permitted ONLY for the
// CLP-00-04 foundation (see ALLOWED_PRISMA_PATHS); everything else remains
// forbidden and a Prisma schema carrying models is rejected separately.
const FORBIDDEN_PATH_PATTERNS = [/(^|[/\\])\.github[/\\]workflows[/\\]/i];

function isAllowedPrismaPath(rel) {
  return ALLOWED_PRISMA_PATHS.some((re) => re.test(rel));
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(path.join(dir, entry.name));
    } else {
      yield path.join(dir, entry.name);
    }
  }
}

const findings = [];
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file);

  for (const pat of FORBIDDEN_PATH_PATTERNS) {
    if (pat.test(rel) && !isAllowedPrismaPath(rel)) {
      findings.push(`[forbidden artifact] ${rel}`);
    }
  }

  if (rel.endsWith('package-lock.json')) continue;

  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  const isAllowlisted = ALLOWLIST_FILES.has(path.basename(rel));
  const isSyntheticTestFixture = ALLOWLIST_TEST_FILES.has(rel.replace(/\\/g, '/'));
  for (const { name, re } of PATTERNS) {
    if (!re.test(content)) continue;
    if (name === 'hardcoded secret assignment' && (isAllowlisted || isSyntheticTestFixture)) {
      continue;
    }
    findings.push(`[${name}] ${rel}`);
  }

  // CLP-00-04: the foundation Prisma schema must declare NO models, and no
  // migration may create a domain table. This keeps CP-00 free of learning-
  // domain schema even though the prisma/ path is now permitted.
  if (/(^|[/\\])schema\.prisma$/i.test(rel)) {
    const modelDecls = content.match(/^\s*model\s+\w+\s*\{/gm) || [];
    if (modelDecls.length) {
      findings.push(
        `[forbidden prisma model] ${rel} declares ${modelDecls.length} model(s); CLP-00-04 allows none`,
      );
    }
  }
  if (/(^|[/\\])migrations[/\\].*\.sql$/i.test(rel)) {
    const createTableStmts = content.match(/CREATE\s+TABLE/gi) || [];
    if (createTableStmts.length) {
      findings.push(
        `[forbidden migration DDL] ${rel} issues CREATE TABLE; CP-00 migrations must add no tables`,
      );
    }
  }
}

if (findings.length) {
  console.error('SECRET/ARTIFACT SCAN FAILED:');
  for (const f of findings) console.error('  - ' + f);
  process.exit(1);
}

console.log('Secret/artifact scan PASSED (no findings).');
