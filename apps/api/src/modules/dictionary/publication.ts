import { Prisma } from '@prisma/client';
import { PrismaService } from '../foundation/prisma.service';
import { canonical, DictionaryError, hash, invalid, uuid } from './domain';

type Tx = Prisma.TransactionClient;
type Entry = {
  id: string;
  publicId: string;
  revision: number;
  publication: string;
  verification: string;
  senseCount: number;
  active: boolean;
  categories: number;
};
type Source = {
  publicId: string;
  label: string;
  url: string;
  rights: string;
  evidence: string | null;
  revision: number;
};
type Category = { publicId: string; label: string; active: boolean; revision: number };
const MAX_GROUP = 25000;
export function publicationInput(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid();
  const b = body as Record<string, unknown>;
  if (
    Object.keys(b).some(
      (k) =>
        !['fingerprint', 'action', 'confirmed', 'contentReviewed', 'reviewReference'].includes(k),
    )
  )
    invalid();
  if (
    typeof b.fingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/.test(b.fingerprint) ||
    typeof b.action !== 'string' ||
    !['PUBLISH', 'UNPUBLISH'].includes(b.action) ||
    (b.contentReviewed !== undefined && typeof b.contentReviewed !== 'boolean') ||
    (b.reviewReference !== undefined && typeof b.reviewReference !== 'string') ||
    b.confirmed !== true
  )
    invalid('Hãy xem trước và xác nhận phạm vi thay đổi.');
  const reference = typeof b.reviewReference === 'string' ? canonical(b.reviewReference) : '';
  if (
    reference.length > 2000 ||
    (b.action === 'PUBLISH' && (b.contentReviewed !== true || reference.length < 20))
  )
    invalid('Cần xác nhận đã rà soát toàn bộ nhóm và ghi căn cứ rà soát ít nhất 20 ký tự.');
  return { fingerprint: b.fingerprint, action: b.action as 'PUBLISH' | 'UNPUBLISH', reference };
}
export function sourceRightsInput(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid();
  const b = body as Record<string, unknown>;
  if (
    Object.keys(b).some((k) => !['expectedRevision', 'rights', 'evidence', 'confirmed'].includes(k))
  )
    invalid();
  if (
    !Number.isSafeInteger(b.expectedRevision) ||
    Number(b.expectedRevision) < 1 ||
    typeof b.rights !== 'string' ||
    !['CONFIRMED', 'UNKNOWN', 'DENIED'].includes(b.rights) ||
    b.confirmed !== true ||
    typeof b.evidence !== 'string'
  )
    invalid();
  const evidence = canonical(b.evidence);
  if (evidence.length < 20 || evidence.length > 2000)
    invalid(
      'Ghi căn cứ quyền sử dụng nguồn từ 20 đến 2.000 ký tự; không nhập mật khẩu hoặc token.',
    );
  return { revision: Number(b.expectedRevision), rights: String(b.rights), evidence };
}
const conflict = () =>
  new DictionaryError(
    409,
    'DICTIONARY_PUBLICATION_CHANGED',
    'Dữ liệu hoặc phạm vi đã thay đổi. Hãy xem trước lại nhóm chuyên ngành.',
  );
async function lock(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(8312601)`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(8312602)`;
}
async function scope(tx: Tx, id: string) {
  const categories = await tx.$queryRaw<
    Category[]
  >`SELECT public_id::text AS "publicId",label,active,revision FROM dictionary_categories WHERE public_id=${id}::uuid`;
  if (!categories.length)
    throw new DictionaryError(404, 'DICTIONARY_NOT_FOUND', 'Không tìm thấy nhóm chuyên ngành.');
  const tree = Prisma.sql`WITH RECURSIVE subtree AS (SELECT id,parent_id,active,revision FROM dictionary_categories WHERE public_id=${id}::uuid UNION ALL SELECT c.id,c.parent_id,c.active,c.revision FROM dictionary_categories c JOIN subtree p ON c.parent_id=p.id), active_tree AS (SELECT id FROM dictionary_categories WHERE parent_id IS NULL AND active UNION ALL SELECT c.id FROM dictionary_categories c JOIN active_tree p ON c.parent_id=p.id WHERE c.active)`;
  const rows = await tx.$queryRaw<
    Entry[]
  >`${tree} SELECT DISTINCT e.id::text,e.public_id::text AS "publicId",e.revision,e.publication,e.verification,(SELECT count(*)::int FROM dictionary_senses s WHERE s.entry_id=e.id) AS "senseCount",EXISTS(SELECT 1 FROM dictionary_entry_categories ec JOIN active_tree ac ON ac.id=ec.category_id WHERE ec.entry_id=e.id) AS active,(SELECT count(*)::int FROM dictionary_entry_categories ec WHERE ec.entry_id=e.id) AS categories FROM dictionary_entries e JOIN dictionary_entry_categories ec ON ec.entry_id=e.id JOIN subtree c ON c.id=ec.category_id ORDER BY e.id::text LIMIT ${MAX_GROUP + 1}`;
  if (rows.length > MAX_GROUP)
    throw new DictionaryError(
      413,
      'DICTIONARY_GROUP_TOO_LARGE',
      'Nhóm vượt 25.000 mục từ. Hãy chọn nhóm con nhỏ hơn.',
    );
  const ids = rows.map((e) => e.id);
  const sources = ids.length
    ? await tx.$queryRaw<
        Source[]
      >`SELECT DISTINCT ds.public_id::text AS "publicId",ds.label,ds.url,ds.rights,ds.rights_evidence AS evidence,ds.revision FROM dictionary_sources ds JOIN dictionary_source_categories sc ON sc.source_id=ds.id JOIN dictionary_sense_origins o ON o.source_category_id=sc.id JOIN dictionary_senses s ON s.id=o.sense_id WHERE s.entry_id IN (${Prisma.join(ids.map((x) => Prisma.sql`${x}::uuid`))}) ORDER BY "publicId"`
    : [];
  const provenance = ids.length
    ? await tx.$queryRaw<
        Array<{ count: number }>
      >`SELECT count(*)::int AS count FROM dictionary_entries e WHERE e.id IN (${Prisma.join(ids.map((x) => Prisma.sql`${x}::uuid`))}) AND NOT EXISTS(SELECT 1 FROM dictionary_senses s JOIN dictionary_sense_origins o ON o.sense_id=s.id WHERE s.entry_id=e.id)`
    : [{ count: 0 }];
  const hierarchy = await tx.$queryRaw<
    Array<{ publicId: string; parentId: string | null; active: boolean; revision: number }>
  >`SELECT public_id::text AS "publicId",parent_id::text AS "parentId",active,revision FROM dictionary_categories ORDER BY public_id`;
  const fingerprint = hash(JSON.stringify({ category: categories[0], rows, sources, hierarchy }));
  const path = await tx.$queryRaw<
    Array<{ active: boolean }>
  >`WITH RECURSIVE ancestors AS (SELECT id,parent_id,active FROM dictionary_categories WHERE public_id=${id}::uuid UNION ALL SELECT c.id,c.parent_id,c.active FROM dictionary_categories c JOIN ancestors a ON a.parent_id=c.id) SELECT bool_and(active) AS active FROM ancestors`;
  const missingRights = sources.filter((s) => s.rights !== 'CONFIRMED' || !s.evidence?.trim());
  const blocked: string[] = [];
  if (!rows.length) blocked.push('Nhóm chưa có mục từ.');
  if (rows.some((e) => e.publication === 'ARCHIVED'))
    blocked.push('Nhóm có mục đã lưu trữ. Cần xử lý riêng trước khi xuất bản.');
  if (rows.some((e) => ['IN_REVIEW', 'NEEDS_CORRECTION'].includes(e.verification)))
    blocked.push(
      'Nhóm có mục đang rà soát hoặc cần sửa nội dung. Cần hoàn tất việc xử lý trước khi xuất bản.',
    );
  if (!path[0].active || rows.some((e) => !e.active))
    blocked.push('Nhóm hoặc đường dẫn chuyên ngành chưa hoạt động.');
  if (rows.some((e) => !e.senseCount) || provenance[0].count)
    blocked.push('Có mục từ thiếu nghĩa hoặc nguồn gốc.');
  if (missingRights.length)
    blocked.push(`Có ${missingRights.length} nguồn chưa được xác nhận quyền sử dụng.`);
  return { rows, sources, category: categories[0], fingerprint, blocked };
}
function preview(s: Awaited<ReturnType<typeof scope>>) {
  return {
    category: s.category,
    fingerprint: s.fingerprint,
    total: s.rows.length,
    published: s.rows.filter((e) => e.publication === 'PUBLISHED').length,
    unverified: s.rows.filter((e) => e.verification !== 'VERIFIED').length,
    sharedEntries: s.rows.filter((e) => e.categories > 1).length,
    sources: s.sources,
    blockers: s.blocked,
    maxGroupSize: MAX_GROUP,
  };
}
export async function publicationPreview(prisma: PrismaService, categoryId: string) {
  return prisma.$transaction(async (tx) => preview(await scope(tx, uuid(categoryId))), {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    timeout: 30000,
  });
}
export async function changePublication(
  prisma: PrismaService,
  categoryId: string,
  actorId: string,
  body: unknown,
) {
  const input = publicationInput(body),
    id = uuid(categoryId);
  return prisma.$transaction(
    async (tx) => {
      await lock(tx);
      const s = await scope(tx, id);
      if (s.fingerprint !== input.fingerprint) throw conflict();
      if (input.action === 'PUBLISH' && s.blocked.length)
        throw new DictionaryError(409, 'DICTIONARY_PUBLICATION_BLOCKED', s.blocked.join(' '));
      if (!s.rows.length) invalid('Nhóm chưa có mục từ.');
      const target = input.action === 'PUBLISH' ? 'PUBLISHED' : 'INTERNAL';
      const changed = s.rows.filter((e) =>
        target === 'INTERNAL'
          ? e.publication === 'PUBLISHED'
          : e.publication !== target || e.verification !== 'VERIFIED',
      );
      if (changed.length) {
        const ids = Prisma.join(changed.map((e) => Prisma.sql`${e.id}::uuid`));
        const note = JSON.stringify({
          categoryId: id,
          action: input.action,
          reviewReference: input.reference,
          contentReviewed: input.action === 'PUBLISH',
          sourceVersions: s.sources.map((x) => ({ publicId: x.publicId, revision: x.revision })),
          sharedEntries: s.rows.filter((e) => e.categories > 1).length,
        });
        // Snapshot current content, including later unverified imports; never rewrite older revisions.
        const inserted =
          await tx.$executeRaw`INSERT INTO dictionary_entry_revisions(id,public_id,entry_id,revision,snapshot,reason,actor_id,updated_at) SELECT gen_random_uuid(),gen_random_uuid(),e.id,e.revision+1,jsonb_build_object('chinese',e.chinese,'pinyin',e.pinyin,'type',e.content_type,'senses',COALESCE((SELECT jsonb_agg(jsonb_build_object('publicId',s.public_id,'vietnamese',s.vietnamese,'english',s.english) ORDER BY s.public_id) FROM dictionary_senses s WHERE s.entry_id=e.id),'[]'::jsonb),'categories',COALESCE((SELECT jsonb_agg(c.public_id ORDER BY c.public_id) FROM dictionary_entry_categories ec JOIN dictionary_categories c ON c.id=ec.category_id WHERE ec.entry_id=e.id),'[]'::jsonb),'publication',${target}::text,'verification',CASE WHEN ${target}='PUBLISHED' THEN 'VERIFIED' ELSE e.verification END,'publicationReview',${note}::jsonb),${input.action === 'PUBLISH' ? 'ADMIN xác nhận rà soát và xuất bản nhóm.' : 'ADMIN gỡ xuất bản nhóm.'},${actorId}::uuid,NOW() FROM dictionary_entries e JOIN dictionary_entry_revisions r ON r.entry_id=e.id AND r.revision=e.revision WHERE e.id IN (${ids})`;
        if (inserted !== changed.length) throw conflict();
        await tx.$executeRaw`UPDATE dictionary_entries SET publication=${target},verification=CASE WHEN ${target}='PUBLISHED' THEN 'VERIFIED' ELSE verification END,revision=revision+1,updated_at=clock_timestamp() WHERE id IN (${ids})`;
        await tx.$executeRaw`INSERT INTO dictionary_audit_events(id,public_id,actor_id,action,target,metadata,updated_at) VALUES(gen_random_uuid(),gen_random_uuid(),${actorId}::uuid,${input.action === 'PUBLISH' ? 'GROUP_PUBLISHED' : 'GROUP_UNPUBLISHED'},${id},${note}::jsonb || jsonb_build_object('changed',${changed.length}::int,'total',${s.rows.length}::int),NOW())`;
      }
      return {
        action: input.action,
        total: s.rows.length,
        changed: changed.length,
        publication: target,
      };
    },
    { timeout: 120000, maxWait: 10000 },
  );
}
export async function changeSourceRights(
  prisma: PrismaService,
  sourceId: string,
  actorId: string,
  body: unknown,
) {
  const input = sourceRightsInput(body),
    id = uuid(sourceId);
  return prisma.$transaction(
    async (tx) => {
      await lock(tx);
      const sources = await tx.$queryRaw<
        Array<{ revision: number }>
      >`SELECT revision FROM dictionary_sources WHERE public_id=${id}::uuid FOR UPDATE`;
      if (!sources.length)
        throw new DictionaryError(404, 'DICTIONARY_NOT_FOUND', 'Không tìm thấy nguồn.');
      if (sources[0].revision !== input.revision) throw conflict();
      await tx.$executeRaw`UPDATE dictionary_sources SET rights=${input.rights},rights_evidence=${input.evidence},revision=revision+1,updated_at=clock_timestamp() WHERE public_id=${id}::uuid`;
      const meta = JSON.stringify({
        rights: input.rights,
        evidence: input.evidence,
        revision: input.revision + 1,
      });
      await tx.$executeRaw`INSERT INTO dictionary_audit_events(id,public_id,actor_id,action,target,metadata,updated_at) VALUES(gen_random_uuid(),gen_random_uuid(),${actorId}::uuid,'SOURCE_RIGHTS_CHANGED',${id},${meta}::jsonb,NOW())`;
      return { publicId: id, rights: input.rights, revision: input.revision + 1 };
    },
    { timeout: 30000, maxWait: 10000 },
  );
}
