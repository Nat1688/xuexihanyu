'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { buildEnvironment } = require('./runtime.cjs');
const { audit } = require('./audit-context.cjs');
const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');
function readinessChecks(ready) {
  // Execute the actual poll/assert expressions from the Docker harness, without
  // registering its real Docker test or invoking containers on Windows.
  const source = read('nginx-readonly.int.cjs');
  const poll = source.match(/if \((ready[^\n]+)\) break;/);
  const final = source.match(/assert\.equal\((ready[^,\n]+), 'up'\);/);
  assert.ok(poll && final, 'readiness checks must remain covered');
  const vm = require('node:vm');
  return {
    stopPolling: vm.runInNewContext('(' + poll[1] + ')', { ready }),
    database: vm.runInNewContext('(' + final[1] + ')', { ready }),
  };
}
test('real readiness response dependencies.database satisfies both Docker harness checks', () => {
  const result = readinessChecks({ status: 'ok', dependencies: { database: 'up' } });
  assert.equal(result.stopPolling, true);
  assert.equal(result.database, 'up');
});
test('flat, missing, down and unconfigured readiness cannot pass the Docker harness', () => {
  for (const ready of [
    undefined,
    null,
    {},
    { status: 'ok', database: 'up' },
    { status: 'error', database: 'up', dependencies: { database: 'down' } },
    { status: 'ok', dependencies: { database: 'not-configured' } },
  ]) {
    const result = readinessChecks(ready);
    assert.equal(result.stopPolling, false);
    assert.notEqual(result.database, 'up');
  }
});
test('all Nginx temporary paths use the existing writable /tmp mount', () => {
  const nginx = read('nginx.conf');
  for (const name of ['client_body', 'proxy', 'fastcgi', 'uwsgi', 'scgi'])
    assert.match(nginx, new RegExp(name + '_temp_path /tmp/[a-z_]+;'));
  assert.match(nginx, /pid \/tmp\/nginx.pid;/);
  assert.doesNotMatch(nginx, /\/var\/cache\/nginx/);
  const yaml = require('js-yaml');
  const web = yaml.load(read('compose.yaml')).services.web;
  assert.equal(web.read_only, true);
  assert.deepEqual(web.tmpfs, ['/tmp']);
  assert.deepEqual(web.cap_drop, ['ALL']);
  assert.deepEqual(web.security_opt, ['no-new-privileges:true']);
  assert.match(read('web.Dockerfile'), /USER nginx/);
});
function fixture() {
  return {
    NODE_ENV: 'production',
    POSTGRES_HOST: 'db',
    POSTGRES_PORT: '5432',
    POSTGRES_DB: 'clp_oci01b2',
    POSTGRES_USER: 'clp_oci01b2',
    POSTGRES_PASSWORD: randomBytes(24).toString('hex') + '@:/?#',
    SESSION_SECRET: randomBytes(32).toString('hex'),
    CSRF_SECRET: randomBytes(32).toString('hex'),
    SPA_ORIGIN: 'https://localhost:18443',
    CLP_RUNTIME_PROFILE: 'disposable',
    CLP_TARGET_CONFIRMATION: 'OCI01B2_SYNTHETIC_ONLY',
  };
}
test('runtime URL built exclusively from fixed synthetic target; special secret chars encoded', () => {
  const input = fixture();
  const env = buildEnvironment(input, 'api');
  const url = new URL(env.DATABASE_URL);
  assert.equal(url.hostname, 'db');
  assert.equal(url.pathname, '/clp_oci01b2');
  assert.equal(decodeURIComponent(url.password), input.POSTGRES_PASSWORD);
  assert.equal(env.LC03B_PREVIEW_ENABLED, 'false');
  assert.equal(input.DATABASE_URL, undefined);
});
for (const [field, value] of [
  ['NODE_ENV', 'development'],
  ['POSTGRES_HOST', '127.0.0.1'],
  ['POSTGRES_DB', 'clp_dev'],
  ['POSTGRES_USER', 'postgres'],
  ['POSTGRES_PORT', '55435'],
  ['CLP_TARGET_CONFIRMATION', ''],
  ['CLP_RUNTIME_PROFILE', ''],
  ['DATABASE_URL', 'override'],
  ['LC03B_PREVIEW_ENABLED', 'true'],
  ['SPA_ORIGIN', 'http://localhost:18080'],
  ['SPA_ORIGIN', 'https://localhost/path'],
  ['SESSION_SECRET', ''],
  ['CSRF_SECRET', ''],
  ['POSTGRES_PASSWORD', ''],
])
  test('fail closed: ' + field + '/' + value, () => {
    assert.throws(() => buildEnvironment({ ...fixture(), [field]: value }, 'migrate'), {
      message: 'PACKAGING_CONFIGURATION_INVALID',
    });
  });
test('reject invalid mode and URL credentials without echoing secret', () => {
  const env = fixture();
  assert.throws(() => buildEnvironment(env, 'seed'));
  env.SPA_ORIGIN = 'https://' + randomBytes(16).toString('hex') + '@localhost';
  assert.throws(() => buildEnvironment(env, 'api'), { message: 'PACKAGING_CONFIGURATION_INVALID' });
});
test('production startup path and native generation are explicit', () => {
  const api = JSON.parse(fs.readFileSync(path.join(__dirname, '../../apps/api/package.json')));
  assert.equal(api.scripts.start, 'node dist/src/main.js');
  const docker = read('api.Dockerfile');
  assert.match(docker, /prisma\/build\/index.js generate/);
  assert.match(docker, /COPY --from=build.*node_modules\/\.prisma/);
  assert.match(docker, /npm ci/);
  assert.doesNotMatch(docker, /COPY node_modules/);
  assert.match(read('runtime.cjs'), /\/app\/apps\/api\/dist\/src\/main.js/);
});
test('proxy strips API prefix, never intercepts API errors, keeps fixed same origin', () => {
  assert.match(read('locations.conf'), /location \^~ \/api\//);
  assert.match(read('locations.conf'), /proxy_pass http:\/\/clp_api\//);
  assert.match(read('nginx.conf'), /server api:3000 resolve/);
  assert.match(read('locations.conf'), /proxy_intercept_errors off/);
  assert.match(read('web.Dockerfile'), /VITE_API_BASE_URL=\/api/);
  assert.doesNotMatch(read('locations.conf'), /proxy_cookie_(?:domain|flags|path)/);
});
test('Compose isolates database and enforces preview OFF', () => {
  const compose = read('compose.yaml');
  const dbSection = compose.split('  db:')[1].split('  migrate:')[0];
  assert.doesNotMatch(dbSection, /ports:/);
  assert.match(compose, /127\.0\.0\.1:\$\{CLP_HTTP_PORT:-18080\}:8080/);
  assert.match(compose, /LC03B_PREVIEW_ENABLED: 'false'/);
  assert.match(compose, /service_completed_successfully/);
  assert.match(compose, /pg17-data:\/var\/lib\/postgresql\/data/);
  assert.match(read('compose.tls.yaml'), /127\.0\.0\.1:\$\{CLP_HTTPS_PORT:-18443\}:8443/);
});

test('Local Trial has a distinct guarded database and cannot adopt disposable credentials/identity', () => {
  const input = {
    ...fixture(),
    CLP_RUNTIME_PROFILE: 'local-trial',
    CLP_TARGET_CONFIRMATION: 'MAC_LOCAL_TRIAL_SYNTHETIC_ONLY',
    POSTGRES_DB: 'clp_local_trial',
    POSTGRES_USER: 'clp_local_trial',
  };
  assert.equal(new URL(buildEnvironment(input, 'api').DATABASE_URL).pathname, '/clp_local_trial');
  for (const patch of [
    { POSTGRES_DB: 'clp_oci01b2' },
    { CLP_TARGET_CONFIRMATION: 'OCI01B2_SYNTHETIC_ONLY' },
    { CLP_RUNTIME_PROFILE: 'production' },
  ])
    assert.throws(() => buildEnvironment({ ...input, ...patch }, 'api'));
});

for (const fixtureName of ['.env', 'package.json'])
  test(
    'context audit rejects ' + (fixtureName === '.env' ? 'secret files' : 'secret content'),
    () => {
      const previousRead = fs.readFileSync,
        previousList = fs.readdirSync;
      fs.readdirSync = () => [
        { name: fixtureName, isSymbolicLink: () => false, isDirectory: () => false },
      ];
      fs.readFileSync = () => 'AK' + 'IA' + 'A'.repeat(16); // inert generated scanner fixture, not a credential
      try {
        assert.throws(() => audit('/context'));
      } finally {
        fs.readFileSync = previousRead;
        fs.readdirSync = previousList;
      }
    },
  );
