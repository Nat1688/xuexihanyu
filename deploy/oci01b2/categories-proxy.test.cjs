'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const config = fs.readFileSync(path.join(__dirname, 'locations.conf'), 'utf8');
test('canonical admin categories GET reaches upstream without implicit slash redirect', () => {
  const match = config.match(/location\s+=\s+\/api\/dictionary\/admin\/categories\s*\{([^}]+)\}/);
  assert.ok(match, 'An exact location must override the slash-prefix auto redirect');
  assert.match(match[1], /proxy_pass\s+http:\/\/clp_api\/dictionary\/admin\/categories;/);
  assert.doesNotMatch(match[1], /\b(return|rewrite|auth_request|proxy_redirect)\b/);
  assert.match(match[1], /proxy_intercept_errors off;/);
  assert.match(match[1], /proxy_cache off;/);
  assert.match(match[1], /add_header Cache-Control "no-store" always;/);
});
test('publication subpaths and original authenticated API boundary remain intact', () => {
  assert.match(config, /location \^~ \/api\/dictionary\/admin\/categories\/ \{/);
  assert.match(config, /proxy_pass http:\/\/clp_api\/dictionary\/admin\/categories\/;/);
  const block = config.match(/location\s+=\s+\/api\/dictionary\/admin\/categories\s*\{([^}]+)\}/)[1];
  for (const name of ['Host $http_host', 'X-Forwarded-For $remote_addr', 'X-Forwarded-Proto $scheme', 'Tailscale-User-Login ""', 'Tailscale-User-Name ""']) assert.ok(block.includes('proxy_set_header ' + name + ';'));
  assert.match(config, /location \^~ \/api\/ \{/);
});
