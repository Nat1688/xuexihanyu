/* UI-V5: compare behavioral AST and interactive attributes with the approved base. */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const base = 'dc44e9dcc14646bce3f6c9a5f8d26f69b9d07984';
const git = (...args) => cp.execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const source = (name, original) =>
  ts.createSourceFile(
    name,
    original ? git('show', `${base}:${name}`) : fs.readFileSync(path.join(root, name), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
const printer = ts.createPrinter({ removeComments: true });
const text = (node, src) =>
  printer.printNode(ts.EmitHint.Unspecified, node, src).replace(/\r\n/g, '\n');
function inspect(src) {
  let body;
  const interactive = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'LoginScreen')
      body = node.body.statements.filter((n) => !ts.isReturnStatement(n)).map((n) => text(n, src));
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      ['form', 'input', 'button', 'a', 'select', 'textarea', 'label'].includes(
        node.tagName.getText(src),
      )
    )
      interactive.push([node.tagName.getText(src), text(node.attributes, src)]);
    ts.forEachChild(node, visit);
  }
  visit(src);
  assert.ok(body);
  return { body, interactive };
}
const login = 'apps/web/src/screens/LoginScreen.tsx';
assert.deepEqual(
  inspect(source(login, false)),
  inspect(source(login, true)),
  'Login hooks/state/handlers/interactive attributes must remain identical',
);
const main = 'apps/web/src/main.tsx';
const normalizeMain = (src) =>
  src.statements
    .filter(
      (n) =>
        !(
          ts.isImportDeclaration(n) &&
          ['./assets/fonts/fonts.css', './cultural-theme.css'].includes(n.moduleSpecifier.text)
        ),
    )
    .map((n) => text(n, src));
assert.deepEqual(normalizeMain(source(main, false)), normalizeMain(source(main, true)));
assert.deepEqual(
  git('diff', '--name-only', base).split('\n').sort(),
  [main, login].sort(),
  'No existing API/backend/schema/deployment/other component modified',
);
const newFiles = git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean);
for (const name of newFiles)
  assert.ok(
    /^apps\/web\/src\/assets\//.test(name) ||
      [
        'apps/web/src/CulturalWelcome.tsx',
        'apps/web/src/cultural-theme.css',
        'apps/web/test/cultural-browser.cjs',
        'apps/web/test/cultural-invariants.cjs',
        'docs/Planning/UI-V5-TASK.md',
        'docs/Review/UI-V5-REDESIGN.md',
      ].includes(name),
    `Unexpected untracked source: ${name}`,
  );
const welcome = fs.readFileSync(path.join(root, 'apps/web/src/CulturalWelcome.tsx'), 'utf8');
assert.ok(!/\b(useState|useEffect|fetch|onClick|onSubmit|dangerouslySetInnerHTML)\b/.test(welcome));
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
assert.equal(
  hash(fs.readFileSync(path.join(root, 'apps/web/src/assets/cultural-landmarks.webp'))),
  'e8b57603a99906ca4bf5a9f3dbcef1c810b74a312242c15ad363edfe7948f4b0',
);
const fonts = path.join(root, 'apps/web/src/assets/fonts');
const manifest = JSON.parse(fs.readFileSync(path.join(fonts, 'MANIFEST.json')));
for (const entry of manifest.files) {
  const data = fs.readFileSync(path.join(fonts, entry.file));
  assert.equal(data.length, entry.bytes);
  assert.equal(hash(data), entry.sha256);
  assert.equal(data.subarray(0, 4).toString(), 'wOF2');
}
assert.ok(
  !/url\(\s*['"]?https?:\/\//.test(fs.readFileSync(path.join(fonts, 'fonts.css'), 'utf8')),
  'No external runtime font request',
);
console.log(
  `UI-V5 invariants PASS: login behavioral AST + interactive attrs, main imports only, protected tracked source, original illustration, ${manifest.files.length} font hashes`,
);
