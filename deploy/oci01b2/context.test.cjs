'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { audit } = require('./audit-context.cjs');
const root = path.resolve(__dirname, '../..');
const current = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8');
// Regression model for this file's restricted syntax only (not a Docker emulator).
// Match file AND parents in order, including negated directory inheritance.
// Actual BuildKit filtering remains mandatory Mac acceptance evidence.
function included(file, text = current) {
  const parents = file.split('/').map((_, i, parts) => parts.slice(0, i + 1).join('/'));
  let excluded = false;
  for (let line of text.split(/\r?\n/).map((s) => s.trim())) {
    if (!line || line.startsWith('#')) continue;
    const negate = line.startsWith('!');
    if (negate) line = line.slice(1);
    line = line.replace(/^\/+|\/+$/g, '');
    assert.doesNotMatch(line, /[\[\]\\?]/, 'unsupported matcher syntax');
    let expression = '^';
    for (let i = 0; i < line.length; i++) {
      if (line.slice(i, i + 3) === '**/') {
        expression += '(?:.*/)?';
        i += 2;
      } else if (line.slice(i, i + 2) === '**') {
        expression += '.*';
        i++;
      } else if (line[i] === '*') expression += '[^/]*';
      else expression += line[i].replace(/[.+^${}()|]/g, '\\$&');
    }
    const re = new RegExp(expression + '$');
    if (parents.some((p) => re.test(p))) excluded = !negate;
  }
  return !excluded;
}
function auditFiles(files) {
  const previousList = fs.readdirSync,
    previousRead = fs.readFileSync;
  fs.readdirSync = () =>
    files.map((name) => ({
      name,
      isSymbolicLink: () => false,
      isDirectory: () => false,
    }));
  fs.readFileSync = (file, encoding) =>
    previousRead(path.join(root, path.relative('/context', file)), encoding);
  try {
    return audit('/context');
  } finally {
    fs.readdirSync = previousList;
    fs.readFileSync = previousRead;
  }
}
test('reproduces old directory-negation leakage; corrected rules exclude documents', () => {
  const old = execFileSync(
    'git',
    ['show', 'a09ea0c4bf742fa8e0390a818a4e4843519dc817:.dockerignore'],
    { cwd: root },
  ).toString();
  assert.equal(included('deploy/oci01b2/ACCEPTANCE.md', old), true);
  assert.equal(included('deploy/oci01b2/ACCEPTANCE.md'), false);
  assert.throws(() => auditFiles(['deploy/oci01b2/ACCEPTANCE.md']), /Unexpected context path/);
});
for (const file of [
  'package.json',
  'package-lock.json',
  'apps/api/package.json',
  'apps/api/src/main.ts',
  'apps/web/src/App.tsx',
  'apps/web/src/styles.css',
  'prisma/schema.prisma',
  'prisma/migrations/migration_lock.toml',
  'prisma/migrations/example/migration.sql',
  'deploy/oci01b2/api.Dockerfile',
  'deploy/oci01b2/web.Dockerfile',
  'deploy/oci01b2/audit-context.cjs',
  'deploy/oci01b2/runtime.cjs',
  'deploy/oci01b2/locations.conf',
])
  test('includes required build path: ' + file, () => assert.equal(included(file), true));
for (const file of [
  'deploy/oci01b2/ACCEPTANCE.md',
  'deploy/oci01b2/REVIEW.md',
  'deploy/oci01b2/compose.yaml',
  'deploy/oci01b2/unrelated.Dockerfile',
  'apps/api/tsconfig.test.json',
  'apps/web/tsconfig.private.json',
  'deploy/oci01b2/packaging.test.cjs',
  '.env',
  'apps/api/.env.production',
  'apps/api/src/.env',
  'credentials.json',
  'apps/api/src/credentials.ts',
  'deploy/oci01b2/credentials.json',
  'deploy/oci01b2/db.dump',
  'deploy/oci01b2/trial.clpbackup',
  'prisma/migrations/private.sql',
  'prisma/migrations/example/backup.sql',
  'prisma/migrations/example/README.md',
  'apps/api/test/sample.ts',
  'apps/api/src/nested/demo.spec.ts',
  'node_modules/package.json',
  'deploy/oci01b2/evidence-local/report.json',
  'deploy/oci01b2/evidence-local/key.pem',
  'apps/web/src/key.pem',
  'apps/api/src/dist/build.ts',
])
  test('excludes non-build path: ' + file, () => assert.equal(included(file), false));
test('all current repository build-context files pass unchanged fail-closed audit', () => {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
  })
    .toString()
    .trim()
    .split(/\r?\n/)
    .filter((f) => included(f));
  assert.ok(files.includes('apps/api/src/main.ts'));
  assert.ok(files.includes('apps/web/src/App.tsx'));
  assert.equal(files.filter((f) => /migration\.sql$/.test(f)).length, 10); // CL-01 additive migration
  assert.equal(auditFiles(files), files.length);
});
test('API and frontend default build paths require successful context-audit stage', () => {
  for (const [file, next] of [
    ['api.Dockerfile', 'dependencies'],
    ['web.Dockerfile', 'build'],
  ]) {
    const text = fs.readFileSync(path.join(__dirname, file), 'utf8').replace(/\r\n/g, '\n');
    assert.match(
      text,
      /FROM base AS context-audit\s+COPY \. \/context\s+RUN node \/context\/deploy\/oci01b2\/audit-context.cjs \/context && touch \/context-audit.ok/,
    );
    assert.ok(
      text.includes(
        'FROM base AS ' +
          next +
          '\nRUN --mount=type=bind,from=context-audit,source=/context-audit.ok,target=/context-audit.ok test -f /context-audit.ok',
      ),
    );
    assert.doesNotMatch(text, /COPY --from=context-audit/); // no context payload in runtime layers
  }
  const api = fs.readFileSync(path.join(__dirname, 'api.Dockerfile'), 'utf8');
  assert.match(api, /FROM dependencies AS build/);
  assert.match(api, /FROM build AS production-dependencies/);
  assert.match(api, /FROM base AS migrate[\s\S]*?COPY --from=dependencies/);
  assert.match(api, /FROM base AS runtime[\s\S]*?COPY --from=production-dependencies/);
  assert.match(
    fs.readFileSync(path.join(__dirname, 'web.Dockerfile'), 'utf8'),
    /COPY --from=build/,
  );
});
