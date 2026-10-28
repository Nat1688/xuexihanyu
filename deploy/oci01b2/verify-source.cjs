'use strict';
// Mac acceptance host: verify frozen export without editing source or invoking Docker.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'SOURCE-MANIFEST.json')));
  if (manifest.baseline !== '8fc28d3a45539c2de5ddb14b94c3a4f9127e0194')
    throw Error('WRONG_BASELINE');
  const expected = new Set(manifest.files.map((f) => f.path));
  for (const f of manifest.files) {
    if (path.isAbsolute(f.path) || f.path.split('/').includes('..')) throw Error('UNSAFE_PATH');
    const file = path.join(root, f.path);
    if (!fs.lstatSync(file).isFile()) throw Error('NOT_REGULAR_FILE');
    const bytes = fs.readFileSync(file);
    if (
      bytes.length !== f.bytes ||
      crypto.createHash('sha256').update(bytes).digest('hex') !== f.sha256
    )
      throw Error('SOURCE_CHANGED');
  }
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name),
        rel = path.relative(root, full).replace(/\\/g, '/');
      if (entry.isSymbolicLink()) throw Error('UNEXPECTED_SYMLINK');
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!['SOURCE-MANIFEST.json', '.DS_Store'].includes(rel) && !expected.has(rel))
        throw Error('UNEXPECTED_SOURCE_FILE');
    }
  }
  walk(root);
  console.log(
    'FROZEN_SOURCE_PASS: ' +
      expected.size +
      ' files, baseline ' +
      manifest.baseline +
      '; no source changes.',
  );
} catch {
  console.error('FROZEN_SOURCE_FAILED: do not edit on Mac; return failure to Windows worktree.');
  process.exitCode = 1;
}
