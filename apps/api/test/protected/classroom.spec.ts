import { ClassroomService } from '../../src/modules/classrooms/classroom-service';
import { ClassroomRepository } from '../../src/modules/classrooms/classroom.repository';
import {
  digestInvitation,
  newInvitation,
  parseInvitation,
  parseStudentLogin,
  type ClassroomActor,
} from '../../src/modules/classrooms/classroom-contract';

const teacher: ClassroomActor = { publicId: 'teacher', roles: ['TEACHER'] };
const student: ClassroomActor = { publicId: 'student', roles: ['STUDENT'] };
const classId = '00000000-0000-4000-8000-000000000001';
const now = new Date('2026-10-29T12:00:00Z');
function fixture() {
  const repository = {
    rotate: jest.fn(),
    revoke: jest.fn(),
    join: jest.fn(),
    enroll: jest.fn(),
    invitation: jest.fn(),
    classes: jest.fn(),
    assignments: jest.fn(),
    progress: jest.fn(),
  };
  return {
    repository,
    service: new ClassroomService(repository as unknown as ClassroomRepository),
  };
}
describe('CL-01 invitation and application boundary', () => {
  it('generates independent 192-bit codes with 24-hour expiry; digest is not the code', () => {
    const rows = Array.from({ length: 100 }, () => newInvitation(now));
    expect(new Set(rows.map((row) => row.code)).size).toBe(100);
    for (const row of rows) {
      expect(row.code).toMatch(/^CL-[A-Za-z0-9_-]{32}$/);
      expect(Buffer.from(row.code.slice(3), 'base64url')).toHaveLength(24);
      expect(row.expiresAt.getTime() - now.getTime()).toBe(86_400_000);
      expect(row.codeHash).toBe(digestInvitation(row.code));
      expect(row.codeHash).not.toContain(row.code);
    }
  });
  it.each([null, {}, 1, '', 'CL-short', 'CL-' + 'x'.repeat(33), 'x'.repeat(1000)])(
    'rejects malformed codes without database access: %p',
    async (value) => {
      const { service, repository } = fixture();
      await expect(service.join(student, value, now)).rejects.toMatchObject({
        code: 'CLASSROOM_INVITATION_INVALID',
        status: 422,
      });
      expect(repository.join).not.toHaveBeenCalled();
    },
  );
  it('trims outer whitespace but preserves code case', () => {
    const code = newInvitation(now).code;
    expect(parseInvitation(` ${code} `)).toBe(code);
  });
  it('normalizes only the exact existing login', () => {
    expect(parseStudentLogin('  STUDENT@EXAMPLE.INVALID ')).toBe('student@example.invalid');
    expect(() => parseStudentLogin({})).toThrow();
    expect(() => parseStudentLogin(' ')).toThrow();
  });
  it('stores only a digest and returns plaintext only after successful rotation', async () => {
    const { service, repository } = fixture();
    const result = await service.rotate(teacher, classId, now);
    expect(repository.rotate).toHaveBeenCalledWith(
      teacher,
      classId,
      digestInvitation(result.code),
      new Date(result.expiresAt),
    );
    expect(result).not.toHaveProperty('codeHash');
    repository.rotate.mockRejectedValueOnce(new Error('write failed'));
    await expect(service.rotate(teacher, classId, now)).rejects.toThrow('write failed');
  });
  it('denies role inversion before repository calls', async () => {
    const { service, repository } = fixture();
    await expect(service.rotate(student, classId, now)).rejects.toMatchObject({ status: 404 });
    await expect(service.join(teacher, newInvitation(now).code, now)).rejects.toMatchObject({
      status: 404,
    });
    expect(repository.rotate).not.toHaveBeenCalled();
    expect(repository.join).not.toHaveBeenCalled();
  });
  it('retains ADMIN override and rejects malformed class identifiers before queries', async () => {
    const { service, repository } = fixture();
    await service.revoke({ publicId: 'admin', roles: ['ADMIN'] }, classId, now);
    expect(repository.revoke).toHaveBeenCalledTimes(1);
    await expect(service.revoke(teacher, 'invalid', now)).rejects.toMatchObject({ status: 404 });
    expect(repository.revoke).toHaveBeenCalledTimes(1);
  });
  it('rate-limits all join attempts per actor, independent of code and outcome', async () => {
    const { service, repository } = fixture();
    for (let i = 0; i < 5; i++) await service.join(student, newInvitation(now).code, now);
    await expect(service.join(student, newInvitation(now).code, now)).rejects.toMatchObject({
      status: 429,
    });
    expect(repository.join).toHaveBeenCalledTimes(5);
    await service.join({ ...student, publicId: 'other' }, newInvitation(now).code, now);
    expect(repository.join).toHaveBeenCalledTimes(6);
  });
});
