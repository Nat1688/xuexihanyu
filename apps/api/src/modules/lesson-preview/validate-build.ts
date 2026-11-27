import { CONTENT_MANIFEST, loadCatalog } from './catalog';
loadCatalog();
process.stdout.write(
  `Catalog validation PASS: ${CONTENT_MANIFEST.revision}, PREVIEW_ONLY; publication prohibited\n`,
);
