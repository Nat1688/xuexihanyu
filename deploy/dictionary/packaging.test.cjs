'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const root = path.resolve(__dirname, '../..');
test('group publication proxy retains64k body cap and extends only admin category operations timeout', () => {
  const config = fs.readFileSync(path.join(root, 'deploy/oci01b2/locations.conf'), 'utf8');
  const scope = config.match(/location \^~ \/api\/dictionary\/admin\/categories\/ \{([^}]+)\}/)[1];
  assert.match(scope, /client_max_body_size 64k;/);
  assert.match(scope, /proxy_read_timeout 150s;/);
  assert.match(scope, /proxy_pass http:\/\/clp_api\/dictionary\/admin\/categories\//);
  assert.match(scope, /Cache-Control "no-store" always/);
  assert.match(config.match(/location \^~ \/api\/ \{([^}]+)\}/)[1], /proxy_read_timeout 45s;/);
});
test('dictionary upload size/time budget is scoped to exactly the two authenticated import routes', () => {
  const config = fs.readFileSync(path.join(root, 'deploy/oci01b2/locations.conf'), 'utf8');
  const locations = [
    ...config.matchAll(/location = (\/api\/dictionary\/admin\/[^\s]+) \{([^}]+)\}/g),
  ];
  assert.deepEqual(
    locations.map((m) => m[1]),
    ['/api/dictionary/admin/imports', '/api/dictionary/admin/imports/dry-run'],
  );
  for (const match of locations) {
    assert.match(match[2], /client_max_body_size 16m;/);
    assert.match(match[2], /proxy_read_timeout 150s;/);
    assert.ok(match[2].includes('proxy_pass http://clp_api' + match[1].slice(4) + ';'));
    assert.match(match[2], /proxy_cache off;/);
    assert.match(match[2], /Cache-Control "no-store" always/);
    assert.match(match[2], /X-Forwarded-For \$remote_addr/);
  }
  assert.match(
    fs.readFileSync(path.join(root, 'deploy/oci01b2/nginx.conf'), 'utf8'),
    /client_max_body_size 64k;/,
  );
  const ordinary = config.match(/location \^~ \/api\/ \{([^}]+)\}/)[1];
  assert.doesNotMatch(ordinary, /client_max_body_size 16m/);
});
test('reviewed non-root Web configuration permission correction is retained', () => {
  const dockerfile = fs.readFileSync(path.join(root, 'deploy/oci01b2/web.Dockerfile'), 'utf8');
  for (const name of ['nginx.conf', 'http.conf', 'locations.conf'])
    assert.ok(dockerfile.includes('COPY --chmod=0644 deploy/oci01b2/' + name + ' '));
  assert.match(dockerfile, /USER nginx/);
  assert.doesNotMatch(dockerfile, /USER root/);
});
test('new import deployment does not widen CORS origins or remove token checks', () => {
  const main = fs.readFileSync(path.join(root, 'apps/api/src/main.ts'), 'utf8');
  assert.match(main, /origin: \[config.SPA_ORIGIN\]/);
  const controller = fs.readFileSync(
    path.join(root, 'apps/api/src/modules/dictionary/controller.ts'),
    'utf8',
  );
  assert.match(controller, /verifyCsrfProof/);
  assert.match(controller, /IMPORT_INTERNAL_UNVERIFIED/);
});
