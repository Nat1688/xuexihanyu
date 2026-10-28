'use strict';
// Build review artifacts only inside this worktree's ignored evidence-local.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const repo = path.resolve(__dirname, '../..');
const baseline = '8fc28d3a45539c2de5ddb14b94c3a4f9127e0194';
const out = path.join(__dirname, 'evidence-local', 'review-package-mac-first');
function git(args, allow = [0]) {
  const r = spawnSync('git', args, {
    cwd: repo,
    windowsHide: true,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (!allow.includes(r.status)) throw Error('GIT_REVIEW_READ_FAILED');
  return r.stdout;
}
const lines = (value) => value.trim().split(/\r?\n/).filter(Boolean);
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const quality = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'evidence-local', 'quality-results.json'), 'utf8'),
);
if (!quality.results?.length || quality.results.some((r) => r.exitCode !== 0))
  throw Error('QUALITY_GATES_NOT_PASSING');
if (
  git(['rev-parse', 'HEAD']).trim() !== baseline ||
  git(['diff', '--cached', '--name-only']).trim()
)
  throw Error('Unexpected HEAD/index');
if (
  git([
    'diff',
    baseline,
    '--',
    'apps/api/src',
    'apps/web/src',
    'prisma',
    'package-lock.json',
    'compose.yaml',
  ]).trim()
)
  throw Error('Protected application source changed');
const added = lines(git(['ls-files', '--others', '--exclude-standard']));
const files = [...lines(git(['diff', '--name-only'])), ...added].sort();
if (
  files.some(
    (f) =>
      !['.gitignore', '.dockerignore', 'apps/api/package.json'].includes(f) &&
      !f.startsWith('deploy/oci01b2/'),
  )
)
  throw Error('Unexpected scope');
fs.mkdirSync(out); // refuse overwriting a previous review package
let patch = git(['diff', '--binary', baseline, '--']);
for (const file of added.sort())
  patch += git(['diff', '--no-index', '--binary', '--', '/dev/null', file], [1]);
fs.writeFileSync(path.join(out, 'OCI01B2-full.patch'), patch);
const records = [];
for (const file of files) {
  const bytes = fs.readFileSync(path.join(repo, file));
  const target = path.join(out, 'source', file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
  records.push({ path: file, sha256: hash(bytes), bytes: bytes.length });
}
fs.writeFileSync(path.join(out, 'FILES.json'), JSON.stringify(records, null, 2));
fs.copyFileSync(
  path.join(__dirname, 'evidence-local', 'quality-results.json'),
  path.join(out, 'quality-results.json'),
);
// Frozen build/acceptance source is authored here on Windows, never patched on Mac.
const candidates = [...new Set([...lines(git(['ls-files', '--cached'])), ...added])].sort();
const buildRoot = path.join(out, 'mac-build-source');
const buildFiles = [];
for (const file of candidates) {
  const include =
    ['.dockerignore', '.gitignore', 'package.json', 'package-lock.json'].includes(file) ||
    /^apps\/(api|web)\/(package\.json|nest-cli\.json|tsconfig[^/]*\.json|vite\.config\.ts|index\.html|src\/.+)$/.test(
      file,
    ) ||
    /^prisma\/(schema\.prisma|migrations\/(migration_lock\.toml|[^/]+\/migration\.sql))$/.test(
      file,
    ) ||
    file.startsWith('deploy/oci01b2/');
  if (!include) continue;
  const bytes = fs.readFileSync(path.join(repo, file));
  const target = path.join(buildRoot, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
  buildFiles.push({ path: file, bytes: bytes.length, sha256: hash(bytes) });
}
fs.writeFileSync(
  path.join(buildRoot, 'SOURCE-MANIFEST.json'),
  JSON.stringify(
    {
      baseline,
      revision: 'mac-first-review-1',
      note: 'Frozen Windows export. Mac extracts/verifies/builds only; no source edits. No credentials, host dependencies, compiled artifacts or seed tools.',
      files: buildFiles,
    },
    null,
    2,
  ),
);
const entries = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      walk(full);
      continue;
    }
    const rel = path.relative(out, full).replace(/\\/g, '/');
    if (
      /(^|\/)(\.env(?:\..*)?|node_modules|\.git|dist)(\/|$)|\.(pem|key|p12|dump|backup|db)$/i.test(
        rel,
      )
    )
      throw Error('Forbidden artifact');
    const bytes = fs.readFileSync(full);
    if (
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{20,}\b|postgres(?:ql)?:\/\/[^\s:/]+:[A-Za-z0-9%._-]+@/.test(
        bytes.toString('utf8'),
      )
    )
      throw Error('Secret candidate');
    entries.push({ path: rel, bytes: bytes.length, sha256: hash(bytes) });
  }
}
walk(out);
fs.writeFileSync(
  path.join(out, 'manifest.json'),
  JSON.stringify(
    {
      task: 'OCI01B2',
      baseline,
      branch: 'feature/oci-01b2-arm64-packaging',
      staged: false,
      committed: false,
      armEvidence:
        'Owner-provided baseline; Mac First packaging/restore/browser/reboot acceptance PENDING',
      entries: entries.sort((a, b) => a.path.localeCompare(b.path)),
      note: 'Manifest excludes itself; no runtime secrets/artifacts in package.',
    },
    null,
    2,
  ),
);
console.log(
  'Review package prepared: ' +
    files.length +
    ' repository files, full untracked-inclusive patch; no index changes.',
);
