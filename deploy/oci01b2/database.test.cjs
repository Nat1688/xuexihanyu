'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { seal, unseal, keyFrom, argsFor, outside } = require('./database.cjs');
test('backup encryption authenticates content and produces a fresh nonce', () => {
  const key = crypto.randomBytes(32),
    payload = { dump: crypto.randomBytes(32).toString('base64'), counts: { users: 0 } };
  const a = seal(payload, key),
    b = seal(payload, key);
  assert.notDeepEqual(a, b);
  assert.deepEqual(unseal(a, key), payload);
  assert.ok(!a.includes(Buffer.from(payload.dump)));
  assert.throws(() => unseal(a, crypto.randomBytes(32)));
  const changed = Buffer.from(a);
  changed[changed.length - 1] ^= 1;
  assert.throws(() => unseal(changed, key));
});
test('invalid keys/headers fail before any Docker/SQL operation', () => {
  assert.throws(() => keyFrom(''));
  assert.throws(() => keyFrom('0'.repeat(63)));
  assert.equal(keyFrom('0'.repeat(64)).length, 32);
  assert.throws(() => unseal(Buffer.alloc(50), crypto.randomBytes(32)));
});
test('restore tooling can select only separate disposable project, never Local Trial for import', () => {
  assert.ok(argsFor('restore').includes('clp-restore-check'));
  assert.ok(argsFor('local-trial').includes('clp-local-trial'));
  assert.throws(() => argsFor('production'));
  assert.throws(() => outside(path.join(__dirname, 'secret.clpbackup')));
});
