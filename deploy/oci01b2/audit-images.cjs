'use strict';
// Mac host Node22+. Inspects only the three local OCI01B2 images; never pushes.
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
function docker(args) {
  const r = spawnSync('docker', ['--context', 'colima-clp-arm64', ...args], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (r.status !== 0) throw Error('IMAGE_AUDIT_COMMAND_FAILED'); // don't echo raw diagnostics/env
  return r.stdout;
}
function inspectFilesystem() {
  const fs = require('node:fs'),
    path = require('node:path');
  const secrets = ['CLP_DB_PASSWORD', 'CLP_SESSION_SECRET', 'CLP_CSRF_SECRET'].map(
    (k) => process.env[k],
  );
  if (secrets.some((s) => !s || s.length < 16)) throw Error('AUDIT_CONFIGURATION');
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(file);
        continue;
      }
      if (/^\.env(?:\.|$)/.test(entry.name) || /\.dll(?:\.node)?$/i.test(entry.name))
        throw Error('FORBIDDEN_IMAGE_ARTIFACT');
      const bytes = fs.readFileSync(file);
      if (secrets.some((s) => bytes.includes(Buffer.from(s))))
        throw Error('RUNTIME_SECRET_IN_IMAGE');
    }
  }
  walk('/app');
  if (fs.existsSync('/app/apps/api/dist/test')) throw Error('TESTS_IN_RUNTIME');
  if (!['arm64', 'x64'].includes(process.arch) || process.platform !== 'linux')
    throw Error('WRONG_ARCH');
  require('/app/node_modules/@prisma/client');
  console.log('Filesystem and native module-load audit PASS');
}
try {
  const values = ['CLP_DB_PASSWORD', 'CLP_SESSION_SECRET', 'CLP_CSRF_SECRET'].map(
    (k) => process.env[k],
  );
  assert.ok(values.every((s) => s && s.length >= 16));
  const evidence = [];
  for (const name of ['api', 'migrate', 'web']) {
    const image = 'clp-oci01b2-' + name + ':review';
    const [metadata] = JSON.parse(docker(['image', 'inspect', image]));
    const platform = process.env.CLP_PLATFORM || 'linux/arm64';
    assert.ok(['linux/arm64', 'linux/amd64'].includes(platform));
    assert.equal(metadata.Architecture, platform.split('/')[1]);
    assert.equal(metadata.Os, 'linux');
    const history = docker(['history', '--no-trunc', '--format', '{{json .CreatedBy}}', image]);
    const env = metadata.Config.Env || [];
    assert.ok(
      !env.some((x) =>
        /^(?:CLP_DB_PASSWORD|POSTGRES_PASSWORD|SESSION_SECRET|CSRF_SECRET|DATABASE_URL)=/.test(x),
      ),
    );
    assert.ok(!values.some((s) => history.includes(s) || JSON.stringify(env).includes(s)));
    const common = [
      'run',
      '--rm',
      '--platform',
      platform,
      '--network',
      'none',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges:true',
    ];
    for (const key of ['CLP_DB_PASSWORD', 'CLP_SESSION_SECRET', 'CLP_CSRF_SECRET'])
      common.push('--env', key);
    if (name !== 'web')
      docker([
        ...common,
        '--entrypoint',
        'node',
        image,
        '-e',
        '(' + inspectFilesystem.toString() + ')()',
      ]);
    else {
      const script =
        'set -eu; test ! -e /app; test ! -e /usr/share/nginx/html/.env; for s in "$CLP_DB_PASSWORD" "$CLP_SESSION_SECRET" "$CLP_CSRF_SECRET"; do if grep -r -F -q -- "$s" /usr/share/nginx/html /etc/nginx; then exit 1; fi; done';
      docker([...common, '--entrypoint', 'sh', image, '-c', script]);
    }
    evidence.push({
      image,
      imageId: metadata.Id,
      architecture: metadata.Architecture,
      os: metadata.Os,
      runtimeSecretCanaryAbsent: true,
    });
  }
  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        note: 'Known runtime-secret canaries, image env/history and payload checks; not an exhaustive vulnerability scan.',
        evidence,
      },
      null,
      2,
    ),
  );
} catch {
  console.error('IMAGE_AUDIT_FAILED');
  process.exitCode = 1;
}
