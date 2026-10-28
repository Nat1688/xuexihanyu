'use strict';
// Uses the already lockfile-provided development js-yaml, no added dependency.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const load = (name) => yaml.load(fs.readFileSync(path.join(__dirname, name), 'utf8'));
test('Compose parses anchors; no API/database host ports, no runtime secrets in build args', () => {
  const c = load('compose.yaml');
  assert.equal(c.services.api.environment.LC03B_PREVIEW_ENABLED, 'false');
  assert.equal(c.services.migrate.environment.NODE_ENV, 'production');
  for (const name of ['api', 'db', 'migrate']) assert.equal(c.services[name].ports, undefined);
  for (const service of Object.values(c.services)) {
    assert.equal(service.platform, '${CLP_PLATFORM:-linux/arm64}');
    assert.equal(service.build?.args, undefined);
    assert.ok(!service.volumes?.some((v) => typeof v === 'string' && /external/.test(v)));
  }
  assert.equal(c.networks.database.internal, true);
  assert.equal(c.services.api.depends_on.migrate.condition, 'service_completed_successfully');
});
test('TLS keys only runtime bind mounts, no generated certificates in build', () => {
  const c = load('compose.tls.yaml');
  assert.deepEqual(c.services.web.ports, ['127.0.0.1:${CLP_HTTPS_PORT:-18443}:8443']);
  for (const v of c.services.web.volumes) {
    assert.equal(v.read_only, true);
    assert.equal(v.bind.create_host_path, false);
  }
});

test('Trial and restore have separate projects/identities; only trial long-running services restart', () => {
  const trial = load('compose.local-trial.yaml'),
    restore = load('compose.restore.yaml');
  assert.equal(trial.name, 'clp-local-trial');
  assert.equal(restore.name, 'clp-restore-check');
  assert.equal(trial.services.db.environment.POSTGRES_DB, 'clp_local_trial');
  for (const s of ['api', 'db', 'web']) assert.equal(trial.services[s].restart, 'unless-stopped');
  assert.equal(restore.services.db.ports, undefined);
  assert.deepEqual(restore.services.db.volumes, ['restore-pg17:/var/lib/postgresql/data']);
  assert.equal(restore.services.db.environment.POSTGRES_DB, 'clp_restore_check');
});
test('OCI override has separate project, preserves production and requires exact origin', () => {
  const c = load('compose.oci.yaml');
  assert.equal(c.name, 'clp-oci01b2-staging');
  assert.match(c.services.api.environment.SPA_ORIGIN, /CLP_OCI_ORIGIN:\?/);
  assert.equal(c.services.api.environment.LC03B_PREVIEW_ENABLED, undefined);
  assert.equal(c.services.api.environment.NODE_ENV, undefined);
});
