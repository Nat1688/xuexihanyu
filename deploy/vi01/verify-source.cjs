'use strict';
// Frozen Web-only source verification; no Git, Docker, network or writes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'SOURCE-MANIFEST.json')));
  if (manifest.baseline !== '6f0ba0d39c68a07137aef94c06e2a25c50e33d92') throw Error('BASELINE');
  const expected = new Set(manifest.files.map((r) => r.path));
  for (const r of manifest.files) {
    if (path.isAbsolute(r.path) || r.path.split('/').includes('..')) throw Error('PATH');
    const file = path.join(root, r.path);
    if (!fs.lstatSync(file).isFile()) throw Error('TYPE');
    const bytes = fs.readFileSync(file);
    if (
      bytes.length !== r.bytes ||
      crypto.createHash('sha256').update(bytes).digest('hex') !== r.sha256
    )
      throw Error('HASH');
  }
  function walk(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name),
        rel = path.relative(root, file).replace(/\\/g, '/');
      if (item.isSymbolicLink()) throw Error('SYMLINK');
      if (item.isDirectory()) walk(file);
      else if (rel !== 'SOURCE-MANIFEST.json' && !expected.has(rel)) throw Error('EXTRA_FILE');
    }
  }
  walk(root);
  console.log('VI01_FROZEN_SOURCE_PASS: ' + expected.size + ' files; no source changes.');
} catch {
  console.error('VI01_FROZEN_SOURCE_FAILED: preserve files; report to Windows worktree.');
  process.exitCode = 1;
}
