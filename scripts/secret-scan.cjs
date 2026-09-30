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

// Forbidden CP-01+ artifacts (should not exist in this skeleton).
const FORBIDDEN_PATH_PATTERNS = [
  /(^|[/\\])schema\.prisma$/i,
  /(^|[/\\])migrations?[/\\]/i,
  /(^|[/\\])prisma[/\\]/i,
  /(^|[/\\])\.github[/\\]workflows[/\\]/i,
];

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
    if (pat.test(rel)) {
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
  for (const { name, re } of PATTERNS) {
    if (!re.test(content)) continue;
    if (isAllowlisted && name === 'hardcoded secret assignment') continue;
    findings.push(`[${name}] ${rel}`);
  }
}

if (findings.length) {
  console.error('SECRET/ARTIFACT SCAN FAILED:');
  for (const f of findings) console.error('  - ' + f);
  process.exit(1);
}

console.log('Secret/artifact scan PASSED (no findings).');
