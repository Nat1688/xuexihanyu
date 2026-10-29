import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(__dirname, '../../../..');
describe('CL-01 approved additive schema and recovery guards', () => {
  it('stores only invitation digest, with one current invitation/class and a class FK', () => {
    const schema = readFileSync(resolve(root, 'prisma/schema.prisma'), 'utf8');
    const body = schema.match(/model ClassInvitation\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(body).toMatch(/classId\s+String\s+@unique/);
    expect(body).toMatch(/codeHash\s+String\s+@unique/);
    expect(body).toContain('expiresAt');
    expect(body).toContain('revokedAt');
    expect(body).not.toMatch(/\bcode\s+String/);
    const sql = readFileSync(
      resolve(root, 'prisma/migrations/20261029000000_cl01_class_invitations/migration.sql'),
      'utf8',
    );
    expect(sql.match(/CREATE TABLE/g)).toHaveLength(1);
    expect(sql).toContain('REFERENCES "teaching_classes"("id")');
    expect(sql).not.toMatch(/\b(?:DELETE FROM|DROP TABLE|TRUNCATE|UPDATE\s+")/i);
  });
  it('backup/fingerprint rejects old schema before restore and includes invitation counts', () => {
    const source = readFileSync(resolve(root, 'deploy/oci01b2/database.cjs'), 'utf8');
    expect(source).toContain("'class_invitations'");
    expect(source).toContain('payload.schemaVersion !== 10');
    expect(source).toContain('Number(payload.counts._prisma_migrations) !== 10');
    expect(source).toContain('19 table counts match; 10 migration rows retained');
  });
});
