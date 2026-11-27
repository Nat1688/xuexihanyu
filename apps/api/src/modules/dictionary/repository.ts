import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../foundation/prisma.service';
import {
  compact,
  DictionaryError,
  hash,
  ImportDocument,
  NORMALIZER_VERSION,
  PARSER_VERSION,
  searchKey,
} from './domain';
import { INITIAL_FIELDS, SOURCE_FIELDS } from './taxonomy';
import { publicationPreview, changePublication, changeSourceRights } from './publication';

type Tx = Prisma.TransactionClient;
type Row = Record<string, unknown>;
const columns: Record<string, Record<string, string>> = {
  dictionary_sources: { label: 'text', url: 'text', rights: 'text', revision: 'integer' },
  dictionary_source_categories: { source_id: 'uuid', label: 'text', position: 'integer' },
  dictionary_entries: {
    chinese: 'text',
    pinyin: 'text',
    identity_hash: 'text',
    pinyin_key: 'text',
    pinyin_compact: 'text',
    pinyin_alias: 'text',
    content_type: 'text',
    verification: 'text',
    publication: 'text',
    revision: 'integer',
  },
  dictionary_senses: {
    entry_id: 'uuid',
    vietnamese: 'text',
    english: 'text',
    identity_hash: 'text',
    vietnamese_key: 'text',
    english_key: 'text',
  },
  dictionary_import_items: {
    batch_id: 'uuid',
    ordinal: 'integer',
    raw: 'jsonb',
    flags: 'jsonb',
    outcome: 'text',
    sense_id: 'uuid',
  },
  dictionary_sense_origins: {
    sense_id: 'uuid',
    source_category_id: 'uuid',
    import_item_id: 'uuid',
  },
  dictionary_categories: {
    parent_id: 'uuid',
    slug: 'text',
    label: 'text',
    chinese_label: 'text',
    position: 'integer',
    active: 'boolean',
    revision: 'integer',
  },
  dictionary_entry_categories: { entry_id: 'uuid', category_id: 'uuid' },
  dictionary_entry_revisions: {
    entry_id: 'uuid',
    revision: 'integer',
    snapshot: 'jsonb',
    reason: 'text',
    actor_id: 'uuid',
  },
};
/** Identifiers exclusively come from this static map, never request bodies. */
async function bulk(tx: Tx, table: string, records: Row[]): Promise<void> {
  const fields = columns[table];
  if (!fields) throw new Error('UNKNOWN_DICTIONARY_TABLE');
  const definitions = {
    id: 'uuid',
    public_id: 'uuid',
    ...fields,
    created_at: 'timestamptz',
    updated_at: 'timestamptz',
  };
  const names = Object.keys(definitions);
  for (let i = 0; i < records.length; i += 500) {
    const now = new Date().toISOString();
    const chunk = records.slice(i, i + 500).map((r) => ({
      id: randomUUID(),
      public_id: randomUUID(),
      ...r,
      created_at: now,
      updated_at: now,
    }));
    const expressions = Object.entries(definitions)
      .map(([name, type]) => (type === 'jsonb' ? `(v->'${name}')` : `(v->>'${name}')::${type}`))
      .join(',');
    await tx.$executeRaw(
      Prisma.sql`INSERT INTO ${Prisma.raw(table)} (${Prisma.raw(names.join(','))}) SELECT ${Prisma.raw(expressions)} FROM jsonb_array_elements(${JSON.stringify(chunk)}::jsonb) v ON CONFLICT DO NOTHING`,
    );
  }
}

export interface SearchInput {
  q: string;
  categoryId?: string;
  type?: string;
  sort: string;
  limit: number;
  cursor?: string;
  includeDescendants?: boolean;
}

@Injectable()
export class DictionaryRepository {
  constructor(private readonly prisma: PrismaService) {}
  publicationPreview(id: string) {
    return publicationPreview(this.prisma, id);
  }
  changePublication(id: string, actorId: string, body: unknown) {
    return changePublication(this.prisma, id, actorId, body);
  }
  changeSourceRights(id: string, actorId: string, body: unknown) {
    return changeSourceRights(this.prisma, id, actorId, body);
  }

  /** Source rows + canonical catalog + provenance commit atomically, on one connection. */
  async import(
    document: ImportDocument,
    filename: string,
    actorId: string,
    failAt?: string,
  ): Promise<Row> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(8312601)`;
        const batches = await tx.$queryRaw<
          Row[]
        >`SELECT * FROM dictionary_import_batches WHERE checksum=${document.checksum} AND parser_version=${PARSER_VERSION} AND normalizer_version=${NORMALIZER_VERSION}`;
        if (batches[0])
          return { batchId: batches[0].public_id, replay: true, ...(batches[0].summary as Row) };
        const id = randomUUID(),
          publicId = randomUUID();
        await tx.$executeRaw`INSERT INTO dictionary_import_batches(id,public_id,filename,checksum,parser_version,normalizer_version,status,summary,actor_id,updated_at) VALUES(${id}::uuid,${publicId}::uuid,${filename},${document.checksum},${PARSER_VERSION},${NORMALIZER_VERSION},'STAGED',${JSON.stringify(document.summary)}::jsonb,${actorId}::uuid,NOW())`;
        await bulk(
          tx,
          'dictionary_sources',
          document.categories.map((c) => ({
            label: c.label,
            url: c.url,
            rights: 'UNKNOWN',
            revision: 1,
          })),
        );
        const sources = await tx.$queryRaw<
          Array<{ id: string; url: string }>
        >`SELECT id,url FROM dictionary_sources`;
        const sourceMap = new Map(sources.map((s) => [s.url, s.id]));
        await bulk(
          tx,
          'dictionary_source_categories',
          document.categories.map((c, position) => ({
            source_id: sourceMap.get(c.url),
            label: c.label,
            position,
          })),
        );
        const sourceCategories = await tx.$queryRaw<
          Array<{ id: string; source_id: string; label: string }>
        >`SELECT id,source_id,label FROM dictionary_source_categories`;
        const categoryMap = new Map(
          sourceCategories.map((c) => [JSON.stringify([c.source_id, c.label]), c.id]),
        );
        const categoryIds = document.categories.map((c) =>
          categoryMap.get(JSON.stringify([sourceMap.get(c.url), c.label]))!,
        );
        const entries = new Map<string, Row>(),
          senses = new Map<string, Row>();
        for (const row of document.rows)
          if (row.fields) {
            const [chinese, pinyin, english, vietnamese] = row.fields;
            const entryHash = hash(JSON.stringify([chinese, pinyin])),
              senseHash = hash(JSON.stringify(row.fields));
            entries.set(entryHash, {
              chinese,
              pinyin,
              identity_hash: entryHash,
              pinyin_key: searchKey(pinyin),
              pinyin_compact: compact(pinyin),
              pinyin_alias: compact(pinyin).replace(/v/gu, 'u'),
              content_type: 'UNCLASSIFIED',
              verification: 'UNVERIFIED',
              publication: 'INTERNAL',
              revision: 1,
            });
            senses.set(senseHash, {
              entry_hash: entryHash,
              vietnamese: vietnamese || null,
              english: english || null,
              identity_hash: senseHash,
              vietnamese_key: searchKey(vietnamese),
              english_key: searchKey(english),
            });
          }
        const existingEntryCount = await tx.$queryRaw<
          Array<{ count: number }>
        >`SELECT count(*)::int AS count FROM dictionary_entries WHERE identity_hash IN (SELECT jsonb_array_elements_text(${JSON.stringify([...entries.keys()])}::jsonb))`;
        const existingSenseCount = await tx.$queryRaw<
          Array<{ count: number }>
        >`SELECT count(*)::int AS count FROM dictionary_senses WHERE identity_hash IN (SELECT jsonb_array_elements_text(${JSON.stringify([...senses.keys()])}::jsonb))`;
        await bulk(tx, 'dictionary_entries', [...entries.values()]);
        const storedEntries = await tx.$queryRaw<
          Array<{
            id: string;
            identity_hash: string;
            verification: string;
            revision: number;
            publication: string;
          }>
        >`SELECT id,identity_hash,verification,revision,publication FROM dictionary_entries WHERE identity_hash IN (SELECT jsonb_array_elements_text(${JSON.stringify([...entries.keys()])}::jsonb)) ORDER BY identity_hash FOR UPDATE`;
        const entryMap = new Map(storedEntries.map((e) => [e.identity_hash, e.id]));
        const protectedEntries = new Set(
          storedEntries
            .filter(
              (e) =>
                e.verification !== 'UNVERIFIED' || e.revision > 1 || e.publication === 'PUBLISHED',
            )
            .map((e) => e.id),
        );
        await bulk(
          tx,
          'dictionary_senses',
          [...senses.values()]
            .filter((s) => !protectedEntries.has(entryMap.get(String(s.entry_hash))!))
            .map((s) => ({ ...s, entry_id: entryMap.get(String(s.entry_hash)) })),
        );
        const storedSenses = await tx.$queryRaw<
          Array<{ id: string; identity_hash: string }>
        >`SELECT id,identity_hash FROM dictionary_senses WHERE identity_hash IN (SELECT jsonb_array_elements_text(${JSON.stringify([...senses.keys()])}::jsonb))`;
        const senseMap = new Map(storedSenses.map((s) => [s.identity_hash, s.id]));
        if (failAt === 'canonical') throw new Error('INJECTED_DICTIONARY_FAILURE');
        const itemRows: Row[] = [],
          origins: Row[] = [];
        const links = new Set<string>();
        // Seed database-driven taxonomy. Unknown future source labels become reviewable roots.
        await bulk(
          tx,
          'dictionary_categories',
          INITIAL_FIELDS.map(([slug, label, chinese_label], position) => ({
            slug,
            label,
            chinese_label,
            position,
            parent_id: null,
            active: true,
            revision: 1,
          })),
        );
        let taxonomy = await tx.$queryRaw<
          Array<{ id: string; slug: string }>
        >`SELECT id,slug FROM dictionary_categories`;
        const rootMap = new Map(taxonomy.map((c) => [c.slug, c.id]));
        const leaves: Row[] = [];
        const sourceSlugs = document.categories.map((c) => {
          const roots = SOURCE_FIELDS[c.label] || [''];
          return roots.map((parent) => {
            const slug = `source-${hash(JSON.stringify([parent, c.label])).slice(0, 24)}`;
            leaves.push({
              slug,
              label: c.label,
              chinese_label: null,
              position: leaves.length,
              parent_id: rootMap.get(parent) || null,
              active: true,
              revision: 1,
            });
            return slug;
          });
        });
        await bulk(tx, 'dictionary_categories', leaves);
        const [categoryCount] = await tx.$queryRaw<
          Array<{ count: number }>
        >`SELECT count(*)::int AS count FROM dictionary_categories`;
        if (categoryCount.count > 1000)
          throw new DictionaryError(
            400,
            'DICTIONARY_CATEGORY_LIMIT',
            'Danh mục vượt giới hạn 1.000 nhóm. Cần rà soát cấu trúc trước khi nhập thêm.',
          );
        taxonomy = await tx.$queryRaw<
          Array<{ id: string; slug: string }>
        >`SELECT id,slug FROM dictionary_categories`;
        const leafMap = new Map(taxonomy.map((c) => [c.slug, c.id]));
        for (const row of document.rows) {
          const itemId = randomUUID();
          const senseId = row.fields ? senseMap.get(hash(JSON.stringify(row.fields))) : null;
          const protectedRow = row.fields
            ? protectedEntries.has(entryMap.get(hash(JSON.stringify(row.fields.slice(0, 2))))!)
            : false;
          itemRows.push({
            id: itemId,
            batch_id: id,
            ordinal: row.ordinal,
            raw: { record: row.raw, sources: row.categories.map((i) => document.categories[i]) },
            flags: protectedRow ? [...row.flags, 'REVIEWED_HEADWORD'] : row.flags,
            outcome: protectedRow ? 'REVIEW_REQUIRED' : row.fields ? 'ACCEPTED' : 'REJECTED',
            sense_id: senseId,
          });
          if (row.fields && senseId && !protectedRow) {
            const entryId = entryMap.get(hash(JSON.stringify(row.fields.slice(0, 2))))!;
            for (const category of row.categories) {
              origins.push({
                sense_id: senseId,
                source_category_id: categoryIds[category],
                import_item_id: itemId,
              });
              for (const slug of sourceSlugs[category])
                links.add(JSON.stringify([entryId, leafMap.get(slug)]));
            }
          }
        }
        await bulk(tx, 'dictionary_import_items', itemRows);
        await bulk(tx, 'dictionary_sense_origins', origins);
        await bulk(
          tx,
          'dictionary_entry_categories',
          [...links].map((l) => {
            const [entry_id, category_id] = JSON.parse(l) as string[];
            return { entry_id, category_id };
          }),
        );
        await bulk(
          tx,
          'dictionary_entry_revisions',
          [...entries]
            .filter(([key]) => !protectedEntries.has(entryMap.get(key)!))
            .map(([key, snapshot]) => ({
              entry_id: entryMap.get(key),
              revision: 1,
              snapshot,
              reason: 'Nhập dữ liệu nguồn, chưa hiệu đính.',
              actor_id: actorId,
            })),
        );
        if (failAt === 'provenance') throw new Error('INJECTED_DICTIONARY_FAILURE');
        const sourceCounts = new Map<number, number>(),
          normalizedCounts = new Map<string, number>();
        for (const row of document.rows)
          for (const category of row.categories)
            sourceCounts.set(category, (sourceCounts.get(category) || 0) + 1);
        for (const link of links) {
          const categoryId = (JSON.parse(link) as string[])[1];
          normalizedCounts.set(categoryId, (normalizedCounts.get(categoryId) || 0) + 1);
        }
        const summary = {
          ...document.summary,
          matchedHeadwords: existingEntryCount[0].count,
          matchedSenses: existingSenseCount[0].count,
          insertedHeadwords: entries.size - existingEntryCount[0].count,
          insertedSenses: storedSenses.length - existingSenseCount[0].count,
          reviewRequiredRows: itemRows.filter((r) => r.outcome === 'REVIEW_REQUIRED').length,
          retainedSourceAssociations: document.rows.reduce((n, r) => n + r.categories.length, 0),
          sourceAssociations: origins.length,
          declaredOriginalRows: document.declaredCounts?.reduce((a, b) => a + b, 0) ?? null,
          sourceCategoryCounts: document.categories.map((c, i) => ({
            label: c.label,
            count: sourceCounts.get(i) || 0,
            declaredCount: document.declaredCounts?.[i] ?? null,
          })),
          normalizedCategoryCounts: [...new Set(leaves.map((c) => String(c.slug)))].map((slug) => ({
            label: String(leaves.find((c) => c.slug === slug)!.label),
            count: normalizedCounts.get(leafMap.get(slug)!) || 0,
          })),
        };
        await tx.$executeRaw`ANALYZE dictionary_entries`;
        await tx.$executeRaw`ANALYZE dictionary_senses`;
        await tx.$executeRaw`UPDATE dictionary_import_batches SET status='COMPLETED',summary=${JSON.stringify(summary)}::jsonb,updated_at=NOW() WHERE id=${id}::uuid`;
        await tx.$executeRaw`INSERT INTO dictionary_audit_events(id,public_id,actor_id,action,target,metadata,updated_at) VALUES(${randomUUID()}::uuid,${randomUUID()}::uuid,${actorId}::uuid,'IMPORT_COMPLETED',${publicId},${JSON.stringify(summary)}::jsonb,NOW())`;
        return { batchId: publicId, replay: false, ...summary };
      },
      { maxWait: 10000, timeout: 120000 },
    );
  }

  private visibility(internal: boolean): Prisma.Sql {
    return internal
      ? Prisma.sql`TRUE`
      : Prisma.sql`e.publication='PUBLISHED' AND e.verification='VERIFIED'
      AND EXISTS (SELECT 1 FROM dictionary_senses s JOIN dictionary_sense_origins o ON o.sense_id=s.id WHERE s.entry_id=e.id)
      AND NOT EXISTS (SELECT 1 FROM dictionary_senses s JOIN dictionary_sense_origins o ON o.sense_id=s.id JOIN dictionary_source_categories sc ON sc.id=o.source_category_id JOIN dictionary_sources ds ON ds.id=sc.source_id WHERE s.entry_id=e.id AND ds.rights<>'CONFIRMED')
      AND EXISTS (SELECT 1 FROM dictionary_entry_categories ec JOIN active_categories ac ON ac.id=ec.category_id WHERE ec.entry_id=e.id)`;
  }
  private activeCategories(): Prisma.Sql {
    return Prisma.sql`WITH RECURSIVE active_categories AS (SELECT id FROM dictionary_categories WHERE parent_id IS NULL AND active=true UNION ALL SELECT c.id FROM dictionary_categories c JOIN active_categories p ON c.parent_id=p.id WHERE c.active=true)`;
  }
  async search(input: SearchInput, internal: boolean): Promise<Row> {
    return this.prisma.$transaction(
      async (tx) => {
        const versionRows = internal
          ? await tx.$queryRaw<
              Array<{ version: string }>
            >`SELECT md5(concat((SELECT max(updated_at)::text FROM dictionary_entries),(SELECT max(updated_at)::text FROM dictionary_sources),(SELECT max(updated_at)::text FROM dictionary_categories),(SELECT max(updated_at)::text FROM dictionary_import_batches))) AS version`
          : await tx.$queryRaw<
              Array<{ version: string }>
            >`${this.activeCategories()}, visible AS (SELECT e.id,e.updated_at FROM dictionary_entries e WHERE ${this.visibility(false)}) SELECT md5(concat((SELECT count(*) FROM visible),(SELECT max(updated_at)::text FROM visible),(SELECT max(ds.updated_at)::text FROM dictionary_sources ds JOIN dictionary_source_categories sc ON sc.source_id=ds.id JOIN dictionary_sense_origins o ON o.source_category_id=sc.id JOIN dictionary_senses s ON s.id=o.sense_id JOIN visible v ON v.id=s.entry_id),(SELECT max(c.updated_at)::text FROM dictionary_categories c JOIN dictionary_entry_categories ec ON ec.category_id=c.id JOIN visible v ON v.id=ec.entry_id))) AS version`;
        const version = versionRows[0].version;
        const signature = hash(JSON.stringify({ ...input, cursor: undefined }));
        let afterRank = 0,
          afterKey = '',
          afterId = '';
        if (input.cursor) {
          try {
            const cursor = JSON.parse(Buffer.from(input.cursor, 'base64url').toString()) as Row;
            if (
              cursor.version !== version ||
              cursor.signature !== signature ||
              !Number.isInteger(cursor.rank) ||
              typeof cursor.key !== 'string' ||
              typeof cursor.id !== 'string'
            )
              throw new Error();
            afterRank = Number(cursor.rank);
            afterKey = cursor.key;
            afterId = cursor.id;
          } catch {
            throw new DictionaryError(
              409,
              'DICTIONARY_CURSOR_EXPIRED',
              'Danh sách đã thay đổi. Vui lòng tìm kiếm lại.',
            );
          }
        }
        const key = searchKey(input.q),
          py = compact(input.q),
          escape = (s: string) => s.replace(/[\\%_]/gu, '\\$&');
        const prefix = escape(key) + '%',
          partial = '%' + escape(key) + '%';
        const match = !key
          ? Prisma.sql`TRUE`
          : Prisma.sql`(e.chinese=${input.q} OR e.pinyin_compact=${py} OR e.pinyin_key=${key} OR e.pinyin_alias=${py} OR s.vietnamese_key LIKE ${input.q.length < 3 ? prefix : partial} OR s.english_key LIKE ${input.q.length < 3 ? prefix : partial} OR e.chinese LIKE ${input.q.length < 3 ? prefix : partial} OR e.pinyin_compact LIKE ${input.q.length < 3 ? escape(py) + '%' : '%' + escape(py) + '%'})`;
        const filter = input.categoryId
          ? Prisma.sql`AND e.id IN (WITH RECURSIVE descendants AS (SELECT id FROM dictionary_categories WHERE public_id=${input.categoryId}::uuid AND (active OR ${internal}) UNION ALL SELECT c.id FROM dictionary_categories c JOIN descendants d ON c.parent_id=d.id WHERE (c.active OR ${internal}) AND ${input.includeDescendants !== false}) SELECT ec.entry_id FROM dictionary_entry_categories ec JOIN descendants d ON d.id=ec.category_id)`
          : Prisma.empty;
        const type = input.type ? Prisma.sql`AND e.content_type=${input.type}` : Prisma.empty;
        const rank = !key
          ? Prisma.sql`1`
          : Prisma.sql`CASE WHEN e.chinese=${input.q} THEN 1 WHEN e.pinyin_compact=${py} OR e.pinyin_key=${key} THEN 2 WHEN s.vietnamese_key=${key} OR s.english_key=${key} THEN 3 WHEN e.chinese LIKE ${prefix} OR e.pinyin_key LIKE ${prefix} OR s.vietnamese_key LIKE ${prefix} OR s.english_key LIKE ${prefix} THEN 4 ELSE 5 END`;
        const candidate = !key
          ? Prisma.empty
          : Prisma.sql`, candidates AS (
        SELECT id FROM dictionary_entries WHERE chinese=${input.q} OR pinyin_compact=${py} OR pinyin_key=${key} OR pinyin_alias=${py} OR chinese LIKE ${input.q.length < 3 ? prefix : partial} OR pinyin_compact LIKE ${input.q.length < 3 ? escape(py) + '%' : '%' + escape(py) + '%'}
        UNION SELECT entry_id FROM dictionary_senses WHERE vietnamese_key LIKE ${input.q.length < 3 ? prefix : partial} OR english_key LIKE ${input.q.length < 3 ? prefix : partial}
      )`;
        const candidateFilter = key
          ? Prisma.sql`AND e.id IN (SELECT id FROM candidates)`
          : Prisma.empty;
        const ranked = Prisma.sql`${this.activeCategories()}${candidate}, ranked AS (SELECT e.id,e.public_id,e.chinese,e.pinyin,e.pinyin_compact AS pinyin_sort,e.content_type,e.verification,e.publication,e.revision,MIN(${rank})::int AS rank FROM dictionary_entries e JOIN dictionary_senses s ON s.entry_id=e.id WHERE ${this.visibility(internal)} AND ${match} ${candidateFilter} ${filter} ${type} GROUP BY e.id)`;
        const counts = await tx.$queryRaw<
          Array<{ count: number }>
        >`${ranked} SELECT count(*)::int AS count FROM ranked`;
        const sortKey =
          input.sort === 'pinyin'
            ? Prisma.sql`pinyin_sort`
            : input.sort === 'chinese'
              ? Prisma.sql`chinese`
              : Prisma.sql`''::text`;
        const sortRank = input.sort === 'relevance' ? Prisma.sql`rank` : Prisma.sql`1`;
        const rows = await tx.$queryRaw<
          Array<Row & { publicId: string; rank: number; sortKey: string }>
        >`${ranked}, ordered AS (SELECT *,${sortKey} AS sort_key,${sortRank} AS sort_rank FROM ranked) SELECT public_id::text AS "publicId",chinese,pinyin,content_type AS type,verification,publication,revision,sort_rank AS rank,sort_key AS "sortKey",(SELECT jsonb_agg(jsonb_build_object('publicId',s.public_id,'vietnamese',s.vietnamese,'english',s.english) ORDER BY s.public_id) FROM (SELECT * FROM dictionary_senses WHERE entry_id=ordered.id ORDER BY public_id LIMIT 10) s) AS senses,(SELECT count(*)::int FROM dictionary_senses WHERE entry_id=ordered.id) AS "senseCount" FROM ordered WHERE (sort_rank,sort_key,public_id::text)>(${afterRank},${afterKey},${afterId}) ORDER BY sort_rank,sort_key,public_id::text LIMIT ${input.limit + 1}`;
        const more = rows.length > input.limit,
          selected = rows.slice(0, input.limit),
          last = selected.at(-1);
        return {
          items: selected.map(({ rank: _rank, sortKey: _key, ...row }) => row),
          total: counts[0].count,
          catalogRevision: version,
          nextCursor:
            more && last
              ? Buffer.from(
                  JSON.stringify({
                    version,
                    signature,
                    rank: last.rank,
                    key: last.sortKey,
                    id: last.publicId,
                  }),
                ).toString('base64url')
              : null,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 },
    );
  }
  async detail(
    publicId: string,
    internal: boolean,
    senseAfter: string | null = null,
  ): Promise<Row> {
    const rows = await this.prisma.$queryRaw<
      Row[]
    >`${this.activeCategories()} SELECT e.public_id::text AS "publicId",e.chinese,e.pinyin,e.content_type AS type,e.verification,e.publication,e.revision,
      (SELECT jsonb_agg(jsonb_build_object('publicId',s.public_id,'vietnamese',s.vietnamese,'english',s.english) ORDER BY s.public_id) FROM (SELECT * FROM dictionary_senses WHERE entry_id=e.id AND (${senseAfter}::uuid IS NULL OR public_id>${senseAfter}::uuid) ORDER BY public_id LIMIT 50) s) AS senses,(SELECT count(*)::int FROM dictionary_senses WHERE entry_id=e.id) AS "senseCount",
      (SELECT jsonb_agg(t) FROM (SELECT DISTINCT c.public_id AS "publicId",c.label FROM dictionary_entry_categories ec JOIN dictionary_categories c ON c.id=ec.category_id WHERE ec.entry_id=e.id AND (${internal} OR c.id IN (SELECT id FROM active_categories)) ORDER BY c.label) t) AS categories,
      (SELECT jsonb_agg(t) FROM (SELECT DISTINCT ds.label,ds.url FROM dictionary_senses s JOIN dictionary_sense_origins o ON o.sense_id=s.id JOIN dictionary_source_categories sc ON sc.id=o.source_category_id JOIN dictionary_sources ds ON ds.id=sc.source_id WHERE s.entry_id=e.id ORDER BY ds.url) t) AS sources
      FROM dictionary_entries e WHERE e.public_id=${publicId}::uuid AND ${this.visibility(internal)}`;
    if (!rows.length)
      throw new DictionaryError(
        404,
        'DICTIONARY_NOT_FOUND',
        'Không tìm thấy mục từ hoặc bạn chưa có quyền xem.',
      );
    const senses = (rows[0].senses || []) as Array<{ publicId: string }>;
    return {
      ...rows[0],
      senses,
      nextSenseCursor: senses.length === 50 ? senses.at(-1)!.publicId : null,
    };
  }
  async categories(internal: boolean): Promise<Row[]> {
    return this.prisma.$queryRaw<
      Row[]
    >`${this.activeCategories()}, visible_entries AS (SELECT e.id,e.content_type FROM dictionary_entries e WHERE ${this.visibility(internal)}), descendants AS (SELECT id AS root,id FROM dictionary_categories WHERE active OR ${internal} UNION ALL SELECT d.root,c.id FROM descendants d JOIN dictionary_categories c ON c.parent_id=d.id WHERE c.active OR ${internal}) SELECT c.public_id::text AS "publicId",p.public_id::text AS "parentId",c.label,c.chinese_label AS "chineseLabel",c.position,count(DISTINCT e.id)::int AS count,count(DISTINCT e.id) FILTER(WHERE e.content_type='SENTENCE')::int AS sentences,count(DISTINCT e.id) FILTER(WHERE e.content_type='UNCLASSIFIED')::int AS unclassified FROM dictionary_categories c LEFT JOIN dictionary_categories p ON p.id=c.parent_id LEFT JOIN descendants d ON d.root=c.id LEFT JOIN dictionary_entry_categories ec ON ec.category_id=d.id LEFT JOIN visible_entries e ON e.id=ec.entry_id WHERE c.active OR ${internal} GROUP BY c.id,p.public_id HAVING count(DISTINCT e.id)>0 ORDER BY c.position,c.label,c.public_id LIMIT 1000`;
  }
  async report(publicId: string, actorId: string, revision: number, comment: string): Promise<Row> {
    const reportId = randomUUID();
    const inserted = await this.prisma.$queryRaw<
      Row[]
    >`${this.activeCategories()} INSERT INTO dictionary_entry_reports(id,public_id,entry_id,revision,reporter_id,comment,updated_at) SELECT ${randomUUID()}::uuid,${reportId}::uuid,e.id,${revision},${actorId}::uuid,${comment},NOW() FROM dictionary_entries e WHERE e.public_id=${publicId}::uuid AND e.revision=${revision} AND ${this.visibility(false)} RETURNING public_id`;
    if (!inserted.length)
      throw new DictionaryError(
        409,
        'DICTIONARY_REVISION_CONFLICT',
        'Mục từ không còn khả dụng hoặc đã thay đổi. Vui lòng tải lại.',
      );
    return { publicId: reportId };
  }
  async overview(): Promise<Row> {
    const result = await this.prisma.$queryRaw<
      Row[]
    >`SELECT (SELECT count(*)::int FROM dictionary_entries) AS headwords,(SELECT count(*)::int FROM dictionary_senses) AS senses,(SELECT count(*)::int FROM dictionary_sources) AS sources,(SELECT count(*)::int FROM dictionary_import_batches) AS batches,(SELECT count(*)::int FROM dictionary_entries WHERE publication='INTERNAL') AS internal`;
    return result[0];
  }
  async batch(publicId: string, afterOrdinal = 0): Promise<Row> {
    const rows = await this.prisma.$queryRaw<
      Row[]
    >`SELECT public_id::text AS "publicId",filename,status,summary,created_at AS "createdAt" FROM dictionary_import_batches WHERE public_id=${publicId}::uuid`;
    if (!rows[0])
      throw new DictionaryError(404, 'DICTIONARY_NOT_FOUND', 'Không tìm thấy lần nhập dữ liệu.');
    const issues = await this.prisma.$queryRaw<
      Row[]
    >`SELECT ordinal,flags,outcome,raw FROM dictionary_import_items WHERE batch_id IN (SELECT id FROM dictionary_import_batches WHERE public_id=${publicId}::uuid) AND ordinal>${afterOrdinal} AND (outcome<>'ACCEPTED' OR flags<>'[]'::jsonb) ORDER BY ordinal LIMIT 20`;
    return {
      ...rows[0],
      issues,
      nextIssueOrdinal: issues.length === 20 ? issues.at(-1)!.ordinal : null,
    };
  }
}
