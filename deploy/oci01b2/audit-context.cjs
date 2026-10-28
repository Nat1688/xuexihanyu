'use strict';
// Run against COPY . inside context-audit, not against a full working checkout.
const fs = require('node:fs');
const path = require('node:path');
function audit(root) {
  let files = 0;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).replace(/\\/g, '/');
      if (entry.isSymbolicLink()) throw Error('Unexpected symlink in context');
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (
        /(^|\/)(node_modules|dist|test|\.git|\.env[^/]*|evidence-local)(\/|$)|\.(pem|key|p12|dump|backup|db|log)$/i.test(
          rel,
        )
      )
        throw Error('Forbidden context artifact: ' + rel);
      const allowed =
        /^(package(?:-lock)?\.json|apps\/(api|web)\/(package\.json|tsconfig[^/]*\.json|nest-cli\.json|vite\.config\.ts|index\.html|src\/.+)|prisma\/(schema\.prisma|migrations\/(migration_lock\.toml|[^/]+\/migration\.sql))|deploy\/oci01b2\/(?:[^/]+\.Dockerfile|runtime\.cjs|healthcheck\.cjs|audit-context\.cjs|tsconfig\.api-build\.json|nginx\.conf|http\.conf|locations\.conf))$/;
      if (!allowed.test(rel)) throw Error('Unexpected context path: ' + rel);
      const text = fs.readFileSync(full, 'utf8');
      if (
        /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{20,}\b|postgres(?:ql)?:\/\/[^\s:/]+:[A-Za-z0-9%._-]+@/.test(
          text,
        )
      )
        throw Error('Secret candidate: ' + rel);
      files++;
    }
  }
  walk(root);
  if (!files) throw Error('Empty context');
  return files;
}
if (require.main === module) {
  try {
    console.log('Context artifact/secret scan PASS: ' + audit(process.argv[2]) + ' files');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { audit };
