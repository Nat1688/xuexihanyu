/**
 * Role authorization policy unit tests (CLP-00-07; ADR-004).
 *
 * Pure, non-HTTP tests over the authorization vocabulary:
 *   - `@RequireRoles` validates the declaration against the approved three-role
 *     set and fails fast on an unknown/empty declaration;
 *   - `isRoleAllowed` is a simple, deterministic set-intersection policy with a
 *     fail-closed default for an empty requirement.
 *
 * Synthetic values only; no session, no DB, no Nest application.
 */
import { ROLES } from '../../src/modules/identity/domain/role';
import {
  InvalidRoleDeclarationError,
  isRoleAllowed,
  ROLES_METADATA_KEY,
  RequireRoles,
} from '../../src/modules/identity/http/require-roles';

describe('RequireRoles declaration', () => {
  it('stores de-duplicated roles under the documented metadata key', () => {
    class Target {
      handler(): void {}
    }
    const decorator = RequireRoles('ADMIN', 'TEACHER', 'ADMIN');
    decorator(
      Target.prototype,
      'handler',
      Object.getOwnPropertyDescriptor(Target.prototype, 'handler')!,
    );
    const metadata = Reflect.getMetadata(ROLES_METADATA_KEY, Target.prototype.handler);
    expect(metadata).toEqual(['ADMIN', 'TEACHER']);
  });

  it('rejects an empty declaration (never fail-open)', () => {
    expect(() => RequireRoles()).toThrow(InvalidRoleDeclarationError);
  });

  it('rejects an unsupported role value at declaration time', () => {
    // Force an out-of-vocabulary value past the compile-time union.
    expect(() => RequireRoles('SUPERADMIN' as never)).toThrow(InvalidRoleDeclarationError);
    expect(() => RequireRoles('TEACHER ' as never)).toThrow(InvalidRoleDeclarationError);
  });

  it('accepts each approved role', () => {
    for (const role of ROLES) {
      expect(() => RequireRoles(role)).not.toThrow();
    }
  });
});

describe('isRoleAllowed policy', () => {
  it('allows when the caller holds one of the required roles', () => {
    expect(isRoleAllowed(['TEACHER'], ['TEACHER', 'ADMIN'])).toBe(true);
    expect(isRoleAllowed(['ADMIN'], ['TEACHER', 'ADMIN'])).toBe(true);
    expect(isRoleAllowed(['STUDENT'], ['STUDENT'])).toBe(true);
  });

  it('denies when the caller holds none of the required roles', () => {
    expect(isRoleAllowed(['STUDENT'], ['TEACHER', 'ADMIN'])).toBe(false);
    expect(isRoleAllowed(['STUDENT'], ['ADMIN'])).toBe(false);
    expect(isRoleAllowed(['TEACHER'], ['ADMIN'])).toBe(false);
  });

  it('denies a caller with no roles at all', () => {
    expect(isRoleAllowed([], ['ADMIN'])).toBe(false);
  });

  it('fails closed when nothing is required', () => {
    expect(isRoleAllowed(['ADMIN'], [])).toBe(false);
  });

  it('allows a multi-role caller when ANY held role matches', () => {
    expect(isRoleAllowed(['STUDENT', 'TEACHER'], ['ADMIN', 'TEACHER'])).toBe(true);
  });
});
