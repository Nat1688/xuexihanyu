import { createRequire } from 'node:module';
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
  it('backup/fingerprint schema selection retains migration10 and supports only explicit migration11', () => {
    const tool = createRequire(__filename)(resolve(root, 'deploy/oci01b2/database.cjs'));
    expect(tool.tablesFor(10)).toHaveLength(19);
    expect(tool.tablesFor(10)).toContain('class_invitations');
    expect(tool.tablesFor(10)).not.toContain('course_applications');
    expect(tool.tablesFor(11)).toEqual([...tool.tablesFor(10), 'course_applications']);
    expect(() => tool.tablesFor(9)).toThrow();
    expect(() => tool.tablesFor(12)).toThrow();
    const previous = process.env.CLP_EXPECTED_MIGRATIONS;
    try {
      process.env.CLP_EXPECTED_MIGRATIONS = '11';
      expect(tool.expectedVersion()).toBe(11);
      process.env.CLP_EXPECTED_MIGRATIONS = '9';
      expect(() => tool.expectedVersion()).toThrow();
    } finally {
      if (previous === undefined) delete process.env.CLP_EXPECTED_MIGRATIONS;
      else process.env.CLP_EXPECTED_MIGRATIONS = previous;
    }
  });
});
