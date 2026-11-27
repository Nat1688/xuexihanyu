'use strict';
// Exports reviewed source and sanitized evidence only. Never stages or modifies Git state.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { verify } = require('./verify-preservation.cjs');
const root = path.resolve(__dirname, '../..');
const base = '6f0ba0d39c68a07137aef94c06e2a25c50e33d92';
const reviewRoot = 'C:/Users/admin/Documents/XueXiHanyu-Recovery/cl01-review';
const output = path.join(reviewRoot, 'package-r3');
const zip = path.join(reviewRoot, 'CL01-independent-review-r3.zip');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function git(args) {
  return cp.execFileSync('git', args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  });
}
function json(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}
function copy(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}
function diffFiles(before, after, relative) {
  before = before.replace(/\\/g, '/');
  after = after.replace(/\\/g, '/');
  const result = cp.spawnSync(
    'git',
    ['diff', '--no-index', '--binary', '--full-index', '--', before, after],
    { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, windowsHide: true },
  );
  assert.ok(result.status === 0 || result.status === 1);
  // Repository changes are text. Authoritative byte hashes are supplied in FILES.json.
  const patch =
    before === '/dev/null'
      ? result.stdout
      : result.stdout.split(before.replace(/\\/g, '/')).join(relative);
  return patch.split(after.replace(/\\/g, '/')).join(relative);
}
assert.equal(git(['branch', '--show-current']).toString().trim(), 'codex/cl01-class-enrollment');
assert.equal(git(['rev-parse', 'HEAD']).toString().trim(), base);
assert.equal(git(['diff', '--cached', '--name-only']).toString().trim(), '');
assert.ok(!fs.existsSync(output) && !fs.existsSync(zip), 'REFUSE_REVIEW_OVERWRITE');
const dependency = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'evidence-local/VI01-BASELINE.json')),
);
const dependencyPaths = new Set(dependency.files.map((file) => file.path));
const tracked = git(['diff', '--name-only', base]).toString().trim().split(/\r?\n/).filter(Boolean);
const untracked = git(['ls-files', '--others', '--exclude-standard'])
  .toString()
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);
const files = [...new Set([...tracked, ...untracked])].sort();
const allowed =
  /^(?:apps\/api\/src\/(?:app\.module\.ts|modules\/student\/application\/student-service\.ts|modules\/classrooms\/[^/]+\.ts)|apps\/api\/test\/(?:protected\/(?:classroom\.spec\.ts|classroom-http\.e2e-spec\.ts|student-service\.spec\.ts)|db\/(?:classroom(?:-schema\.spec|\.int-spec)\.ts|prisma-identity-schema\.spec\.ts|session-migration\.spec\.ts))|apps\/web\/(?:src\/(?:api\/classrooms\.ts|classrooms\/[^/]+\.tsx|teacher\/teacher\.css)|test\/classrooms\.spec\.tsx)|deploy\/(?:cl01\/[^/]+\.(?:cjs|md)|oci01b2\/(?:database|context\.test)\.cjs)|prisma\/(?:schema\.prisma|migrations\/20261029000000_cl01_class_invitations\/migration\.sql)|scripts\/secret-scan\.cjs)$/;
for (const file of files) {
  assert.ok(dependencyPaths.has(file) || allowed.test(file), 'OUT_OF_SCOPE_FILE: ' + file);
  assert.ok(
    !/(^|\/)(?:\.env[^/]*|node_modules|dist|evidence-local)(\/|$)|\.(?:dump|backup|db|log|pem|key)$/i.test(
      file,
    ),
  );
}
fs.mkdirSync(output, { recursive: true });
const identities = files.map((file) => {
  const bytes = fs.readFileSync(path.join(root, file));
  copy(path.join(root, file), path.join(output, 'source', file));
  return {
    path: file,
    bytes: bytes.length,
    sha256: hash(bytes),
    dependency: dependencyPaths.has(file)
      ? 'VI01 overlay (possibly extended by CL01; see incremental patch)'
      : 'CL01',
  };
});
json(path.join(output, 'FILES.json'), identities);
json(path.join(output, 'DEPENDENCY-VI01.json'), dependency);
let full = git(['diff', '--binary', '--full-index', base]).toString();
for (const file of untracked) full += diffFiles('/dev/null', file, file);
fs.writeFileSync(path.join(output, 'CL01-full.patch'), full);
let incremental = '';
const temp = path.join(reviewRoot, 'comparison-r3');
for (const file of files) {
  const before = path.join(temp, file);
  let bytes;
  if (dependencyPaths.has(file))
    bytes = fs.readFileSync(path.join('C:/Users/admin/Documents/XueXiHanyu-VI01', file));
  else {
    try {
      bytes = git(['show', `${base}:${file}`]);
    } catch {
      bytes = null;
    }
  }
  if (bytes === null) incremental += diffFiles('/dev/null', file, file);
  else {
    fs.mkdirSync(path.dirname(before), { recursive: true });
    fs.writeFileSync(before, bytes);
    incremental += diffFiles(before, file, file);
  }
}
fs.writeFileSync(path.join(output, 'CL01-incremental-over-VI01.patch'), incremental);
for (const patch of ['CL01-full.patch', 'CL01-incremental-over-VI01.patch'])
  git(['apply', '--reverse', '--check', path.join(output, patch)]);
json(path.join(output, 'evidence-preservation.json'), verify());
copy(
  path.join(__dirname, 'evidence-local/realstack-results.json'),
  path.join(output, 'evidence/realstack-results.json'),
);
copy(
  path.join(__dirname, 'evidence-local/quality-results.json'),
  path.join(output, 'evidence/quality-results.json'),
);
for (const file of fs
  .readdirSync(path.join(__dirname, 'evidence-local/screenshots'))
  .filter((file) => /^0[1-8]-.*\.png$/.test(file)))
  copy(
    path.join(__dirname, 'evidence-local/screenshots', file),
    path.join(output, 'screenshots', file),
  );
const entries = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) walk(file);
    else {
      const bytes = fs.readFileSync(file);
      const relative = path.relative(output, file).replace(/\\/g, '/');
      if (!relative.endsWith('.png'))
        assert.ok(
          !/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{20,}\b|postgres(?:ql)?:\/\/[^\s:/]+:[A-Za-z0-9%._-]+@/.test(
            bytes.toString('utf8'),
          ),
          'SECRET_CANDIDATE: ' + relative,
        );
      entries.push({ path: relative, bytes: bytes.length, sha256: hash(bytes) });
    }
  }
}
walk(output);
json(path.join(output, 'manifest.json'), {
  task: 'CL-01',
  baseline: base,
  dependencyZip: dependency.reviewZip,
  branch: 'codex/cl01-class-enrollment',
  staged: false,
  committed: false,
  deployed: false,
  entries,
  note: 'Changed source including all untracked files; full R3a diff plus incremental diff over exact VI01 overlay. No runtime configuration, passwords, invitation codes, database dumps or dependencies. Screenshots: real-stack synthetic accounts, invitation output masked. Windows PG/Chrome evidence; Mac/ARM64 not run.',
});
fs.mkdirSync(path.dirname(zip), { recursive: true });
cp.execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-Command',
    `Compress-Archive -Path '${output.replace(/'/g, "''")}/*' -DestinationPath '${zip}' -CompressionLevel Optimal`,
  ],
  { windowsHide: true },
);
console.log(
  JSON.stringify(
    {
      zip,
      sha256: hash(fs.readFileSync(zip)).toUpperCase(),
      repositoryFiles: files.length,
      manifestEntries: entries.length,
    },
    null,
    2,
  ),
);
