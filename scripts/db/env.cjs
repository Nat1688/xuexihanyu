#!/usr/bin/env node
/**
 * CLP-00-04 — Minimal, dependency-free `.env` loader for database scripts.
 *
 * The Prisma CLI reads `.env` itself, but our guard/status helpers need the
 * same values in Node. This loader:
 *   - reads only the git-ignored repo-root `.env` file;
 *   - never touches the real `process.env` values already set (precedence:
 *     explicit shell env > `.env` file);
 *   - fails safe: a missing file is not an error for read-only commands;
 *   - never prints or returns secret values except through `getUrl()`.
 *
 * It deliberately does NOT import a dotenv dependency to keep the foundation
 * boundary explicit and auditable.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ENV_FILE = path.join(REPO_ROOT, '.env');

/** Environment variable NAMES for the CLP databases (never values). */
const DATABASE_URL_KEYS = Object.freeze({
  dev: 'DATABASE_URL',
  test: 'TEST_DATABASE_URL',
});

/**
 * Parse a `.env`-style file into a plain object. Values are NOT expanded and
 * quotes are stripped. `#` starts a comment.
 *
 * @param {string} filePath
 * @returns {Record<string, string>}
 */
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

/**
 * Resolve an environment variable, preferring an explicit shell value over the
 * `.env` file. Returns `undefined` when neither is present.
 *
 * @param {string} key
 * @param {Record<string, string>} [fileEnv]
 * @returns {string|undefined}
 */
function resolveKey(key, fileEnv = parseEnvFile(ENV_FILE)) {
  if (process.env[key] !== undefined && process.env[key] !== '') return process.env[key];
  return fileEnv[key];
}

/**
 * Resolve the database URL for a named environment ('dev' | 'test').
 *
 * @param {'dev'|'test'} which
 * @returns {string|undefined}
 */
function getUrl(which) {
  const key = DATABASE_URL_KEYS[which];
  if (!key) throw new Error(`unknown environment "${which}"`);
  return resolveKey(key);
}

module.exports = {
  REPO_ROOT,
  ENV_FILE,
  DATABASE_URL_KEYS,
  parseEnvFile,
  resolveKey,
  getUrl,
};
