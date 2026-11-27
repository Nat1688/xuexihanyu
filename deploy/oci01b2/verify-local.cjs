'use strict';
// No Docker, SQL, migration, seed, app startup or network operations.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const repo = path.resolve(__dirname, '../..');
const out = path.join(__dirname, 'evidence-local', 'logs');
fs.mkdirSync(out, { recursive: true });
const git = (args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
if (
  git(['rev-parse', 'HEAD']) !== '446428f0285cd6fb5058637a5bd84a9da542b6bf' ||
  git(['branch', '--show-current']) !== 'feature/oci-01b2-arm64-packaging' ||
  git(['diff', '--cached', '--name-only'])
)
  throw Error('Unexpected worktree/index');
const files = [
  ...git(['diff', '--name-only']).split('\n'),
  ...git(['ls-files', '--others', '--exclude-standard']).split('\n'),
].filter((f) => /\.(cjs|json|yaml|md)$/.test(f));
const steps = [
  [
    'syntax',
    [
      ...git(['diff', '--name-only']).split('\n'),
      ...git(['ls-files', '--others', '--exclude-standard']).split('\n'),
    ]
      .filter((f) => f.endsWith('.cjs'))
      .map((f) => 'node --check ' + f)
      .join(' && '),
  ],
  [
    'packaging',
    'node --test deploy/oci01b2/packaging.test.cjs deploy/oci01b2/context.test.cjs deploy/oci01b2/compose.test.cjs deploy/oci01b2/database.test.cjs',
  ],
  [
    'targeted',
    'npm run test -w @clp/api -- --runInBand lesson-preview.spec.ts option-ordering.spec.ts exercise-service.spec.ts',
  ],
  ['api-regression', 'npm run test -w @clp/api -- --runInBand'],
  ['frontend', 'npm run test -w @clp/web'],
  ['lint', 'npm run lint'],
  ['typecheck', 'npm run typecheck'],
  ['build', 'npm run build'],
  ['secret-scan', 'npm run secret-scan'],
  ['changed-format', 'node node_modules/prettier/bin/prettier.cjs --check ' + files.join(' ')],
  ['diff-check', 'git diff --check && git diff --cached --check'],
];
const results = [];
for (const [name, command] of steps) {
  const r = spawnSync(command, {
    cwd: repo,
    shell: true,
    windowsHide: true,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  fs.writeFileSync(path.join(out, name + '.log'), (r.stdout || '') + (r.stderr || ''));
  results.push({ name, command, exitCode: r.status });
  console.log(name + ': ' + (r.status === 0 ? 'PASS' : 'FAIL'));
}
fs.writeFileSync(
  path.join(__dirname, 'evidence-local', 'quality-results.json'),
  JSON.stringify(
    { host: process.platform + '/' + process.arch, node: process.version, results },
    null,
    2,
  ),
);
process.exitCode = results.some((r) => r.exitCode !== 0) ? 1 : 0;
