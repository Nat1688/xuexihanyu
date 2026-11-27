'use strict';
const assert = require('node:assert/strict'),
  crypto = require('node:crypto'),
  path = require('node:path'),
  fs = require('node:fs');
module.exports = async function ({
  root,
  prisma,
  repo,
  users,
  api,
  admin,
  student,
  teacher,
  browser,
  owned,
  step,
}) {
  const { parseImport } = require(
    path.join(root, 'apps/api/dist/src/modules/dictionary/domain.js'),
  );
  const { changePublication } = require(
    path.join(root, 'apps/api/dist/src/modules/dictionary/publication.js'),
  );
  const actor = users.ADMIN.id;
  const data = {
    cats: ['DICT07 synthetic A', 'DICT07 synthetic B'],
    sources: ['https://example.invalid/dict07/a', 'https://example.invalid/dict07/b'],
    entries: [
      ['测试甲', 'cèshì jiǎ', 'synthetic A', 'kiểm thử A', [0]],
      ['测试乙', 'cèshì yǐ', 'synthetic B', 'kiểm thử B', [1]],
      ['测试共用', 'cèshì gòngyòng', 'synthetic shared', 'kiểm thử dùng chung', [0, 1]],
    ],
  };
  await repo.import(
    parseImport(Buffer.from(JSON.stringify(data)), 'json'),
    'publication-synthetic.json',
    actor,
  );
  await repo.import(
    parseImport(
      Buffer.from(
        JSON.stringify({
          ...data,
          entries: [['测试甲', 'cèshì jiǎ', 'synthetic alternate', 'nghĩa thử nghiệm khác', [0]]],
        }),
      ),
      'json',
    ),
    'publication-alternate-synthetic.json',
    actor,
  );
  const entries =
    await prisma.$queryRaw`SELECT id::text,public_id::text AS "publicId",chinese FROM dictionary_entries WHERE chinese IN ('测试甲','测试乙','测试共用') ORDER BY chinese`;
  assert.equal(entries.length, 3);
  const parent = crypto.randomUUID(),
    a = crypto.randomUUID(),
    b = crypto.randomUUID();
  await prisma.$executeRaw`INSERT INTO dictionary_categories(id,public_id,slug,label,updated_at) VALUES(${parent}::uuid,${parent}::uuid,'dict07-test-parent','DICT07 synthetic group',NOW())`;
  for (const [id, label] of [
    [a, 'DICT07 synthetic A'],
    [b, 'DICT07 synthetic B'],
  ])
    await prisma.$executeRaw`INSERT INTO dictionary_categories(id,public_id,parent_id,slug,label,updated_at) VALUES(${id}::uuid,${id}::uuid,${parent}::uuid,${id},${label},NOW())`;
  for (const e of entries) {
    await prisma.$executeRaw`DELETE FROM dictionary_entry_categories WHERE entry_id=${e.id}::uuid`;
    for (const id of e.chinese === '测试共用' ? [a, b] : [e.chinese === '测试甲' ? a : b])
      await prisma.$executeRaw`INSERT INTO dictionary_entry_categories(id,public_id,entry_id,category_id,updated_at) VALUES(gen_random_uuid(),gen_random_uuid(),${e.id}::uuid,${id}::uuid,NOW())`;
  }
  const body = (p) => ({
    fingerprint: p.fingerprint,
    action: 'PUBLISH',
    confirmed: true,
    contentReviewed: true,
    reviewReference:
      'Synthetic specialist review for disposable fixture only; not actual corpus sign-off.',
  });
  const unpublish = (p) => ({ ...body(p), action: 'UNPUBLISH', contentReviewed: false });
  const state = async () => ({
    rows: await prisma.$queryRaw`SELECT public_id::text,revision,verification,publication FROM dictionary_entries WHERE chinese IN ('测试甲','测试乙','测试共用') ORDER BY public_id`,
    revisions:
      await prisma.$queryRaw`SELECT count(*)::int AS count FROM dictionary_entry_revisions`,
    audit: await prisma.$queryRaw`SELECT count(*)::int AS count FROM dictionary_audit_events`,
  });
  await step(
    'DICT07 category subtree and shared entry scope, rights gate and no partial publish',
    async () => {
      const p = await repo.publicationPreview(a);
      assert.equal(p.total, 2);
      assert.equal(p.sharedEntries, 1);
      assert.equal(p.sources.length, 2);
      assert.ok(p.blockers.length);
      assert.equal((await repo.publicationPreview(parent)).total, 3);
      const before = await state();
      await assert.rejects(
        () => repo.changePublication(a, actor, body(p)),
        (e) => e.status === 409,
      );
      assert.deepEqual(await state(), before);
      for (const s of p.sources)
        await repo.changeSourceRights(s.publicId, actor, {
          expectedRevision: s.revision,
          rights: 'CONFIRMED',
          confirmed: true,
          evidence: 'Synthetic test-only rights fixture. No actual corpus rights asserted.',
        });
      await assert.rejects(
        () => repo.changePublication(a, actor, body(p)),
        (e) => e.status === 409,
      );
      const next = await repo.publicationPreview(a);
      assert.deepEqual(next.blockers, []);
      await assert.rejects(
        () =>
          repo.changeSourceRights(next.sources[0].publicId, actor, {
            expectedRevision: 1,
            rights: 'CONFIRMED',
            confirmed: true,
            evidence: 'Stale synthetic evidence should be rejected safely.',
          }),
        (e) => e.status === 409,
      );
    },
  );
  await step(
    'DICT07 inactive ancestor blocks even entries having another active category',
    async () => {
      const alternate = crypto.randomUUID();
      await prisma.$executeRaw`INSERT INTO dictionary_categories(id,public_id,slug,label,updated_at) VALUES(${alternate}::uuid,${alternate}::uuid,'dict07-active-alternate','DICT07 active alternative',NOW())`;
      for (const e of entries.filter((e) => e.chinese !== '测试乙'))
        await prisma.$executeRaw`INSERT INTO dictionary_entry_categories(id,public_id,entry_id,category_id,updated_at) VALUES(gen_random_uuid(),gen_random_uuid(),${e.id}::uuid,${alternate}::uuid,NOW())`;
      await prisma.$executeRaw`UPDATE dictionary_categories SET active=false,revision=revision+1 WHERE id=${parent}::uuid`;
      const p = await repo.publicationPreview(a);
      assert.ok(p.blockers.some((x) => x.includes('hoạt động')));
      await assert.rejects(
        () => repo.changePublication(a, actor, body(p)),
        (e) => e.status === 409,
      );
      await prisma.$executeRaw`UPDATE dictionary_categories SET active=true,revision=revision+1 WHERE id=${parent}::uuid`;
      await prisma.$executeRaw`DELETE FROM dictionary_entry_categories WHERE category_id=${alternate}::uuid`;
    },
  );
  await step(
    'DICT07 rollback of revisions and publication on injected mid-write failure',
    async () => {
      const before = await state(),
        p = await repo.publicationPreview(a);
      const fault = {
        $transaction: (operation, options) =>
          prisma.$transaction(
            (tx) =>
              operation(
                new Proxy(tx, {
                  get(target, key) {
                    if (key === '$executeRaw')
                      return (...args) => {
                        if (
                          (
                            args[0].sql || (Array.isArray(args[0]) ? args[0].join('') : '')
                          ).includes('UPDATE dictionary_entries')
                        )
                          throw new Error('INJECTED_PUBLICATION_FAILURE');
                        return target.$executeRaw(...args);
                      };
                    const value = Reflect.get(target, key);
                    return typeof value === 'function' ? value.bind(target) : value;
                  },
                }),
              ),
            options,
          ),
      };
      await assert.rejects(
        () => changePublication(fault, a, actor, body(p)),
        /INJECTED_PUBLICATION_FAILURE/,
      );
      assert.deepEqual(await state(), before);
    },
  );
  await step(
    'DICT07 concurrent publish serializes with one revision/audit change and learner visibility',
    async () => {
      const p = await repo.publicationPreview(a);
      const results = await Promise.allSettled([
        repo.changePublication(a, actor, body(p)),
        repo.changePublication(a, actor, body(p)),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(
        results.filter((r) => r.status === 'rejected' && r.reason.status === 409).length,
        1,
      );
      const fresh = await repo.publicationPreview(a);
      assert.equal(fresh.published, 2);
      const visible = await repo.search({ q: '测试甲', sort: 'relevance', limit: 10 }, false);
      assert.equal(visible.total, 1);
      assert.equal(
        (await repo.search({ q: '测试乙', sort: 'relevance', limit: 10 }, false)).total,
        0,
      );
      const cats = await repo.categories(false);
      assert.equal(cats.find((c) => c.publicId === b).count, 1);
      const detail = await repo.detail(entries.find((e) => e.chinese === '测试甲').publicId, false);
      assert.ok(!JSON.stringify(detail).includes('Synthetic test-only rights fixture'));
      const again = await repo.changePublication(a, actor, body(fresh));
      assert.equal(again.changed, 0);
      const snapshots =
        await prisma.$queryRaw`SELECT snapshot FROM dictionary_entry_revisions r JOIN dictionary_entries e ON e.id=r.entry_id WHERE e.chinese='测试甲' AND r.revision=2`;
      assert.equal(snapshots[0].snapshot.publication, 'PUBLISHED');
      assert.equal(snapshots[0].snapshot.senses.length, 2);
    },
  );
  await step(
    'DICT07 source revocation immediately hides content and stale plans conflict',
    async () => {
      const p = await repo.publicationPreview(a),
        s = p.sources[0];
      await repo.changeSourceRights(s.publicId, actor, {
        expectedRevision: s.revision,
        rights: 'UNKNOWN',
        confirmed: true,
        evidence: 'Synthetic revocation for policy regression, not actual source.',
      });
      assert.equal(
        (await repo.search({ q: '测试共用', sort: 'relevance', limit: 10 }, false)).total,
        0,
      );
      await assert.rejects(
        () => repo.changePublication(a, actor, body(p)),
        (e) => e.status === 409,
      );
      const now = await repo.publicationPreview(a),
        source = now.sources.find((x) => x.publicId === s.publicId);
      await repo.changeSourceRights(source.publicId, actor, {
        expectedRevision: source.revision,
        rights: 'CONFIRMED',
        confirmed: true,
        evidence: 'Synthetic fixture permission restored for this disposable test only.',
      });
    },
  );
  await step(
    'DICT07 real HTTP RBAC/CSRF denied requests leave publication/audit unchanged',
    async () => {
      const group = api + '/dictionary/admin/categories/' + a + '/publication',
        source =
          api +
          '/dictionary/admin/sources/' +
          (await repo.publicationPreview(a)).sources[0].publicId +
          '/rights';
      const before = await state();
      for (const headers of [
        {},
        student,
        teacher,
        { Cookie: admin.Cookie },
        { ...admin, 'X-CSRF-Token': 'bad' },
      ]) {
        for (const route of [group, source]) {
          const r = await fetch(route, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          assert.ok([401, 403].includes(r.status));
        }
      }
      assert.deepEqual(await state(), before);
      const p = await repo.publicationPreview(a);
      const r = await fetch(group, {
        method: 'POST',
        headers: { ...admin, 'Content-Type': 'application/json' },
        body: JSON.stringify(unpublish(p)),
      });
      assert.equal(r.status, 200);
      assert.equal((await r.json()).changed, 2);
      assert.equal(
        (await repo.search({ q: '测试共用', sort: 'relevance', limit: 10 }, false)).total,
        0,
      );
    },
  );
  await step(
    'DICT07 archived, draft and correction-required states are not silently revived',
    async () => {
      const beta = entries.find((e) => e.chinese === '测试乙');
      await prisma.$executeRaw`UPDATE dictionary_entries SET publication='ARCHIVED' WHERE id=${beta.id}::uuid`;
      let p = await repo.publicationPreview(parent);
      assert.ok(p.blockers.some((b) => b.includes('lưu trữ')));
      await assert.rejects(
        () => repo.changePublication(parent, actor, body(p)),
        (e) => e.status === 409,
      );
      assert.equal((await repo.changePublication(parent, actor, unpublish(p))).changed, 0);
      assert.equal(
        (
          await prisma.$queryRaw`SELECT publication FROM dictionary_entries WHERE id=${beta.id}::uuid`
        )[0].publication,
        'ARCHIVED',
      );
      await prisma.$executeRaw`UPDATE dictionary_entries SET publication='DRAFT' WHERE id=${beta.id}::uuid`;
      p = await repo.publicationPreview(parent);
      assert.equal((await repo.changePublication(parent, actor, unpublish(p))).changed, 0);
      assert.equal(
        (
          await prisma.$queryRaw`SELECT publication FROM dictionary_entries WHERE id=${beta.id}::uuid`
        )[0].publication,
        'DRAFT',
      );
      await prisma.$executeRaw`UPDATE dictionary_entries SET publication='INTERNAL' WHERE id=${beta.id}::uuid`;
      const alpha = entries.find((e) => e.chinese === '测试甲');
      await prisma.$executeRaw`UPDATE dictionary_entries SET verification='NEEDS_CORRECTION' WHERE id=${alpha.id}::uuid`;
      p = await repo.publicationPreview(a);
      assert.ok(p.blockers.some((b) => b.includes('cần sửa')));
      await assert.rejects(
        () => repo.changePublication(a, actor, body(p)),
        (e) => e.status === 409,
      );
      await prisma.$executeRaw`UPDATE dictionary_entries SET verification='VERIFIED' WHERE id=${alpha.id}::uuid`;
    },
  );
  await step('DICT07 oversized group is refused without truncated publication', async () => {
    const large = crypto.randomUUID();
    await prisma.$executeRaw`INSERT INTO dictionary_categories(id,public_id,slug,label,updated_at) VALUES(${large}::uuid,${large}::uuid,'dict07-large-test','DICT07 oversized synthetic group',NOW())`;
    await prisma.$executeRaw`INSERT INTO dictionary_entry_categories(id,public_id,entry_id,category_id,updated_at) SELECT gen_random_uuid(),gen_random_uuid(),e.id,${large}::uuid,NOW() FROM (SELECT id FROM dictionary_entries WHERE chinese LIKE 'DICT-BENCH-%' LIMIT 25001) e`;
    await assert.rejects(
      () => repo.publicationPreview(large),
      (e) => e.status === 413 && e.code === 'DICTIONARY_GROUP_TOO_LARGE',
    );
  });
  await step(
    'DICT07 actual browser group publication, mobile review and unpublish UI',
    async () => {
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        locale: 'en-US',
      });
      await ctx.addCookies(
        admin.Cookie.split('; ').map((c) => {
          const i = c.indexOf('=');
          return { name: c.slice(0, i), value: c.slice(i + 1), domain: '127.0.0.1', path: '/' };
        }),
      );
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.name));
      try {
        await page.goto('http://127.0.0.1:5206', { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: 'Quản lý từ điển', exact: true }).click();
        await page.getByText('Xuất bản theo nhóm chuyên ngành', { exact: true }).click();
        await page.getByLabel('Nhóm chuyên ngành cần xuất bản').selectOption(a);
        await page.getByRole('button', { name: 'Xem trước phạm vi xuất bản', exact: true }).click();
        await page
          .getByRole('region', { name: 'Phạm vi xuất bản' })
          .waitFor()
          .catch(() => page.getByText('Có 1 mục thuộc nhiều nhóm.', { exact: false }).waitFor());
        const publish = page.getByRole('button', { name: 'Xuất bản toàn bộ nhóm', exact: true });
        assert.equal(await publish.isDisabled(), true);
        await page
          .getByLabel('Ghi chú hoặc tài liệu rà soát nội dung toàn nhóm (20–2.000 ký tự)')
          .fill('Synthetic browser specialist review of test-only fixtures.');
        await page
          .getByLabel(
            'Tôi đã rà soát toàn bộ nội dung nhóm và xác nhận đủ điều kiện phục vụ người học.',
          )
          .check();
        await page
          .getByLabel('Tôi xác nhận phạm vi cả nhóm con và ảnh hưởng đến các mục từ dùng chung.')
          .check();
        await publish.click();
        await page.getByText('Đã xuất bản 2 trong 2 mục từ của nhóm.', { exact: false }).waitFor();
        assert.equal(
          (await repo.search({ q: '测试甲', sort: 'relevance', limit: 10 }, false)).total,
          1,
        );
        await page.getByRole('button', { name: 'Xem trước phạm vi xuất bản', exact: true }).click();
        await page.getByText('Đã xuất bản: 2.', { exact: false }).waitFor();
        await page.setViewportSize({ width: 390, height: 844 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({
          path: path.join(owned, 'publication-admin-390.png'),
          fullPage: true,
        });
        await page
          .getByLabel('Tôi xác nhận phạm vi cả nhóm con và ảnh hưởng đến các mục từ dùng chung.')
          .check();
        await page.getByRole('button', { name: 'Gỡ xuất bản toàn bộ nhóm', exact: true }).click();
        await page
          .getByText('Đã gỡ xuất bản 2 trong 2 mục từ của nhóm.', { exact: false })
          .waitFor();
        assert.equal(
          (await repo.search({ q: '测试甲', sort: 'relevance', limit: 10 }, false)).total,
          0,
        );
        assert.deepEqual(errors, []);
      } finally {
        await ctx.close();
      }
    },
  );
  const last = await repo.publicationPreview(a);
  assert.equal(last.published, 0);
  fs.writeFileSync(
    path.join(owned, 'publication-summary.json'),
    JSON.stringify(
      {
        status: 'PASS',
        syntheticOnly: true,
        realCorpusPublished: false,
        groupMembers: 2,
        sharedEntries: 1,
        reviewSignature:
          'Synthetic fixture evidence only; no human sign-off claimed for real corpus.',
      },
      null,
      2,
    ),
  );
};
