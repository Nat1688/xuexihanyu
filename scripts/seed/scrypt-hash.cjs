#!/usr/bin/env node
/**
 * CLP-00-11 — Minimal scrypt hashing helper for the seed/bootstrap scripts.
 *
 * Reproduces the EXACT encoded-hash format the API's `ScryptPasswordHasher`
 * (CLP-00-05) produces and verifies, so a seeded credential authenticates
 * through the normal login path:
 *
 *   scrypt$N=<n>,r=<r>,p=<p>$<saltBase64>$<derivedKeyBase64>
 *
 * This is intentionally a tiny, dependency-free re-implementation of the
 * ENCODE side only (the scripts never verify). The parameters (N, r, p, keylen)
 * match the API defaults; the salt is random per hash. The plaintext is used
 * ephemerally and is NEVER returned, logged or persisted.
 */
'use strict';

const { randomBytes, scryptSync } = require('node:crypto');

/** Cost parameters matching the API default `DEFAULT_SCRYPT_PARAMS`. */
const SCRYPT_PARAMS = Object.freeze({ N: 32768, r: 8, p: 1, keylen: 32, saltLength: 16 });

/**
 * Derive the encoded scrypt hash string for a plaintext password.
 *
 * @param {string} plain
 * @param {{ N?: number, r?: number, p?: number, keylen?: number, saltLength?: number }} [params]
 * @returns {string} encoded hash (contains a random salt; no plaintext)
 */
function hashPassword(plain, params = {}) {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('hashPassword requires a non-empty plaintext');
  }
  const { N, r, p, keylen, saltLength } = { ...SCRYPT_PARAMS, ...params };
  const salt = randomBytes(saltLength);
  const intrinsic = 128 * N * r;
  const maxmem = Math.max(32 * 1024 * 1024, intrinsic * 2);
  const derived = scryptSync(plain, salt, keylen, { N, r, p, maxmem });
  return [
    'scrypt',
    `N=${N},r=${r},p=${p}`,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * The JSON `parameters` object persisted alongside a hash (numeric only, as the
 * repository's `normalizeParameters` expects).
 */
function hashParameters(params = {}) {
  const { N, r, p, keylen } = { ...SCRYPT_PARAMS, ...params };
  return { N, r, p, keylen };
}

module.exports = { SCRYPT_PARAMS, hashPassword, hashParameters };
