'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function git(root, args) {
  return cp
    .execFileSync('git', ['-c', 'safe.directory=' + root, '-C', root, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    })
    .trim();
}
function clean(root, head) {
  assert.equal(git(root, ['rev-parse', 'HEAD']), head);
  assert.equal(git(root, ['status', '--porcelain=v1']), '');
  return { head, clean: true };
}
function preserved(root, name, expectedZip) {
  const evidence = path.join(root, `deploy/${name}/evidence-local`);
  const files = JSON.parse(fs.readFileSync(path.join(evidence, 'review-package/FILES.json')));
  for (const file of files)
    assert.equal(hash(fs.readFileSync(path.join(root, file.path))), file.sha256);
  const actual = hash(
    fs.readFileSync(path.join(evidence, `${name.toUpperCase()}-independent-review.zip`)),
  );
  assert.equal(actual, expectedZip.toLowerCase());
  return { verifiedSourceFiles: files.length, zipSha256: actual };
}
function verify() {
  const main = 'C:/Users/admin/Documents/chinese-learning-foundation';
  const original = 'C:/Users/admin/.codex/worktrees/lp01-vietnamese-ui/chinese-learning-foundation';
  const files = [
    ...new Set(
      (
        git(original, ['diff', '--name-only']) +
        '\n' +
        git(original, ['ls-files', '--others', '--exclude-standard'])
      )
        .split(/\r?\n/)
        .filter(Boolean),
    ),
  ].sort();
  assert.equal(files.length, 16);
  const fingerprints = files.map((file) => ({
    path: file,
    sha256: hash(fs.readFileSync(path.join(original, file))),
  }));
  const ref = git(main, ['rev-parse', 'codex/demo-seed-wip-preservation']);
  assert.equal(ref, '7572b9e491641848eb2f8feba00fb1221fdeba3d');
  return {
    main: clean(main, '8fc28d3a45539c2de5ddb14b94c3a4f9127e0194'),
    r3a: clean(
      'C:/Users/admin/Documents/XueXiHanyu-OCI-01B2',
      '6f0ba0d39c68a07137aef94c06e2a25c50e33d92',
    ),
    m06: preserved(
      'C:/Users/admin/Documents/XueXiHanyu-M06',
      'm06',
      '5B9F19013B9CE2F900033D8F0F5132701AB78FA351391188D5CB56D8A1B6F577',
    ),
    vi01: preserved(
      'C:/Users/admin/Documents/XueXiHanyu-VI01',
      'vi01',
      '06BBD0D96515C0DBC85D7684EEEDE76903E786DC2716630A3ADA7A37C3E032D3',
    ),
    english: clean(
      'C:/Users/admin/.codex/worktrees/english-teaches-chinese/chinese-learning-foundation',
      'd59d2faf1de3b91147ca2070ddc45f2d7e8d4420',
    ),
    originalViWip: {
      files: fingerprints.length,
      fingerprints,
      receiptSha256: hash(JSON.stringify(fingerprints)),
    },
    preservationRef: ref,
    note: 'Read-only checks; individual current VI WIP hashes supplied. No Main/track/M06/VI01 writes or pilot operations were performed.',
  };
}
if (require.main === module) console.log(JSON.stringify(verify(), null, 2));
module.exports = { verify };
