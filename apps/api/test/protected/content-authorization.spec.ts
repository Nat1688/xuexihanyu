/**
 * CP-01 content mutation authorization matrix (pure, no Nest, no DB).
 *
 * CP-01 constraint: "All authoring mutations require TEACHER/ADMIN server-side
 * authorization." This proves the full matrix at the policy level:
 *
 *   | Role        | create | mutate own | mutate other |
 *   |-------------|--------|------------|--------------|
 *   | ADMIN       | yes    | yes        | yes          |
 *   | TEACHER     | yes    | yes        | no (403)     |
 *   | STUDENT     | no     | no         | no           |
 *   | (anonymous) | no     | no         | no           |
 */
import {
  assertCanCreateContent,
  assertCanMutateContent,
  canAuthorContent,
  isAdmin,
  type ContentActor,
} from '../../src/modules/content/domain';
import { ForbiddenError } from '../../src/modules/identity/application/auth-errors';
import { type Role } from '../../src/modules/identity/domain';

function actor(userId: string, roles: Role[]): ContentActor {
  return { userId, roles };
}

describe('content authoring policy — role gate', () => {
  it('ADMIN and TEACHER may author; STUDENT and anonymous may not', () => {
    expect(canAuthorContent(actor('u', ['ADMIN']))).toBe(true);
    expect(canAuthorContent(actor('u', ['TEACHER']))).toBe(true);
    expect(canAuthorContent(actor('u', ['STUDENT']))).toBe(false);
    expect(canAuthorContent(actor('u', []))).toBe(false);
  });

  it('isAdmin is true only for ADMIN', () => {
    expect(isAdmin(actor('u', ['ADMIN']))).toBe(true);
    expect(isAdmin(actor('u', ['TEACHER']))).toBe(false);
  });

  it('create: only ADMIN/TEACHER pass, others get a uniform 403', () => {
    expect(() => assertCanCreateContent(actor('t1', ['TEACHER']))).not.toThrow();
    expect(() => assertCanCreateContent(actor('a1', ['ADMIN']))).not.toThrow();
    expect(() => assertCanCreateContent(actor('s1', ['STUDENT']))).toThrow(ForbiddenError);
    expect(() => assertCanCreateContent(actor('x', []))).toThrow(ForbiddenError);
  });
});

describe('content authoring policy — ownership (mutate)', () => {
  it('ADMIN may mutate ANY node', () => {
    expect(() => assertCanMutateContent(actor('admin-1', ['ADMIN']), 'someone-else')).not.toThrow();
  });

  it('TEACHER may mutate only their OWN node', () => {
    expect(() => assertCanMutateContent(actor('t1', ['TEACHER']), 't1')).not.toThrow();
    expect(() => assertCanMutateContent(actor('t1', ['TEACHER']), 't2')).toThrow(ForbiddenError);
  });

  it('STUDENT and anonymous may never mutate, even their "own"', () => {
    expect(() => assertCanMutateContent(actor('s1', ['STUDENT']), 's1')).toThrow(ForbiddenError);
    expect(() => assertCanMutateContent(actor('x', []), 'x')).toThrow(ForbiddenError);
  });

  it('never leaks which check failed (uniform 403 message)', () => {
    try {
      assertCanMutateContent(actor('t1', ['TEACHER']), 't2');
      fail('expected ForbiddenError');
    } catch (error) {
      expect((error as ForbiddenError).code).toBe('AUTH_FORBIDDEN');
      expect((error as ForbiddenError).message).toBe('Insufficient privileges.');
    }
  });
});
