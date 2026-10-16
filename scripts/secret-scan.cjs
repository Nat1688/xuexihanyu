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

// CLP-00-04/00-05 Prisma artifacts that are now expected to exist.
const ALLOWED_PRISMA_PATHS = [
  /(^|[/\\])prisma[/\\]schema\.prisma$/i,
  /(^|[/\\])prisma[/\\]migrations[/\\]/i,
];

// Approved schema: CLP-00-05/06 identity+session, CP-01 content, CP-03 learning
// events, CP-04 mastery projection. Any other model/table means a later-
// checkpoint or forbidden schema leaked in.
const APPROVED_MODELS = new Set([
  'User',
  'PasswordCredential',
  'UserRoleAssignment',
  'Session',
  'Course',
  'Unit',
  'Lesson',
  'LearningItem',
  'LessonLearningItem',
  'LearningEvent',
  'MasteryProjection',
]);
// Approved base tables (CLP-00-05/06 identity+session, CP-01 content, CP-03
// learning events, CP-04 mastery projection) + Prisma metadata.
const APPROVED_TABLES = new Set([
  '_prisma_migrations',
  'courses',
  'learning_items',
  'lesson_learning_items',
  'lessons',
  'learning_events',
  'mastery_projections',
  'password_credentials',
  'sessions',
  'units',
  'user_roles',
  'users',
]);

// Test files that intentionally contain SYNTHETIC fixtures for the config
// boundary (CLP-00-03). These must never hold real values; the scanner still
// checks them for high-signal patterns (keys, tokens) — only the generic
// "hardcoded secret assignment" heuristic is relaxed.
const ALLOWLIST_TEST_FILES = new Set([
  'apps/api/test/protected/config.spec.ts',
  'apps/api/test/protected/spa-config.spec.ts',
  'apps/api/test/protected/health.e2e-spec.ts',
  'apps/api/test/protected/test-harness.spec.ts',
  'apps/api/test/protected/identity-auth-service.spec.ts',
  'apps/api/test/protected/identity-auth.e2e-spec.ts',
  'apps/api/test/protected/identity-role-authorization.e2e-spec.ts',
  // CP-01 content HTTP authorization e2e — synthetic, inert test password only.
  'apps/api/test/protected/content-authorization.e2e-spec.ts',
  'apps/api/test/protected/logging-redaction.spec.ts',
  'apps/api/test/protected/logging-structured-logger.spec.ts',
  'apps/api/test/protected/logging-startup-diagnostics.spec.ts',
  'apps/api/test/support/factories.ts',
  // CLP-00-11 synthetic seed/bootstrap fixtures — inert, non-namespace-reserved
  // placeholders only (never real credentials).
  'apps/api/test/protected/seed-guard.spec.ts',
  'apps/api/test/db/synthetic-seed.int-spec.ts',
  'apps/api/test/db/bootstrap-admin.int-spec.ts',
]);

// Forbidden CP-04+ artifacts (should not exist in this skeleton).
// NOTE: `prisma/` + `schema.prisma` + `migrations/` are permitted for the
// CLP-00-04 foundation and the approved CLP-00/CP-01/CP-03 schema (see
// ALLOWED_PRISMA_PATHS); everything else remains forbidden and a Prisma schema
// declaring a non-approved model is rejected separately.
const FORBIDDEN_PATH_PATTERNS = [/(^|[/\\])\.github[/\\]workflows[/\\]/i];

function isAllowedPrismaPath(rel) {
  return ALLOWED_PRISMA_PATHS.some((re) => re.test(rel));
}

function isApprovedWorkflow(rel) {
  return rel.replace(/\\/g, '/') === '.github/workflows/quality.yml';
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
    if (pat.test(rel) && !isAllowedPrismaPath(rel) && !isApprovedWorkflow(rel)) {
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

  // CLP-00/CP-01/CP-03: the schema may declare ONLY the approved models
  // (identity, session, content and learning-event), and no migration may create
  // a table outside that approved set (plus Prisma's own metadata table).
  if (/(^|[/\\])schema\.prisma$/i.test(rel)) {
    const modelDecls = content.match(/^\s*model\s+(\w+)\s*\{/gm) || [];
    for (const decl of modelDecls) {
      const name = decl.replace(/^\s*model\s+/, '').replace(/\s*\{$/, '');
      if (!APPROVED_MODELS.has(name)) {
        findings.push(
          `[forbidden prisma model] ${rel} declares "${name}"; the approved CLP-00/CP-01/CP-03 schema allows only ` +
            `${[...APPROVED_MODELS].join(', ')}`,
        );
      }
    }
  }
  if (/(^|[/\\])migrations[/\\].*\.sql$/i.test(rel)) {
    const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([\w]+)"?/gi;
    let m;
    while ((m = createRe.exec(content)) !== null) {
      const table = m[1].toLowerCase();
      if (table !== '_prisma_migrations' && !APPROVED_TABLES.has(table)) {
        findings.push(
          `[forbidden migration DDL] ${rel} creates "${table}"; the approved CLP-00/CP-01/CP-03 schema allows only ` +
            `${[...APPROVED_TABLES].join(', ')}`,
        );
      }
    }
  }
}

if (findings.length) {
  console.error('SECRET/ARTIFACT SCAN FAILED:');
  for (const f of findings) console.error('  - ' + f);
  process.exit(1);
}

console.log('Secret/artifact scan PASSED (no findings).');
