'use strict';
// Spawned by the approved disposable harness; never chooses a connection itself.
const assert = require('node:assert/strict'),
  fs = require('node:fs');
assert.equal(process.env.DICT_DISPOSABLE_APPROVAL, 'APPROVED_55441_3116_5206');
const target = new URL(process.env.DATABASE_URL);
assert.equal(target.hostname, '127.0.0.1');
assert.equal(target.port, '55441');
assert.equal(target.pathname, '/clp_dict_test');
const { PrismaClient } = require('@prisma/client');
const {
  DictionaryRepository,
} = require('../../apps/api/dist/src/modules/dictionary/repository.js');
const prisma = new PrismaClient({ log: [] }),
  repo = new DictionaryRepository(prisma);
async function benchmark() {
  const samples = [];
  const terms = [
    '合同',
    'hop dong',
    'hetong',
    'contract',
    'kế toán',
    '海关',
    'xin chao',
    'hàng',
    'zhong',
    'not-present-unique',
  ];
  await repo.search({ q: '合同', sort: 'relevance', limit: 20 }, true);
  const baseline = process.memoryUsage().rss;
  for (let i = 0; i < 10; i++)
    await Promise.all(
      Array.from({ length: 5 }, async (_, j) => {
        const start = performance.now();
        await repo.search({ q: terms[(i + j) % terms.length], sort: 'relevance', limit: 20 }, true);
        samples.push(performance.now() - start);
      }),
    );
  samples.sort((a, b) => a - b);
  const [size] =
    await prisma.$queryRaw`SELECT pg_database_size(current_database())::text AS bytes,(SELECT count(*)::int FROM dictionary_entries) AS headwords,(SELECT count(*)::int FROM dictionary_senses) AS senses`;
  const plan =
    await prisma.$queryRaw`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT id FROM dictionary_senses WHERE vietnamese_key LIKE '%hop dong%'`;
  return {
    iterations: samples.length,
    clients: 5,
    p50Milliseconds: Math.round(samples[25]),
    p95Milliseconds: Math.round(samples[47]),
    p99Milliseconds: Math.round(samples[49]),
    ...size,
    baselineRssBytes: baseline,
    finalRssBytes: process.memoryUsage().rss,
    plan,
  };
}
benchmark()
  .then((report) =>
    fs.writeFileSync(process.env.DICT_BENCHMARK_OUTPUT, JSON.stringify(report, null, 2)),
  )
  .catch((error) => {
    console.error('BENCHMARK_FAILED ' + error.name);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
