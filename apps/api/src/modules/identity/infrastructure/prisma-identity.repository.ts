/**
 * Prisma-backed identity repository (CLP-00-06; ADR-004).
 *
 * Implements the read-only {@link IdentityRepository} port over `users`,
 * `password_credentials` and `user_roles`. It returns exactly the data
 * authentication needs and never surfaces credential plaintext (there is none)
 * or domain/profile data.
 */
import { Injectable } from '@nestjs/common';

import {
  type AuthCandidate,
  type IdentityRepository,
  type StoredCredential,
} from '../application/identity-repository';
import { type Role } from '../domain';
import { parsePublicUserId } from '../domain/public-user-id';
import { PrismaService } from '../../foundation/prisma.service';

interface UserRow {
  id: string;
  publicId: string;
  login: string;
  loginNormalized: string;
  state: 'PENDING' | 'ACTIVE' | 'DISABLED';
  credential: {
    algorithm: string;
    parameters: unknown;
    hash: string;
  } | null;
  roles: { role: Role }[];
}

@Injectable()
export class PrismaIdentityRepository implements IdentityRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toCandidate(row: UserRow): AuthCandidate {
    const credential: StoredCredential | null = row.credential
      ? {
          algorithm: row.credential.algorithm,
          parameters: normalizeParameters(row.credential.parameters),
          hash: row.credential.hash,
        }
      : null;
    return {
      userId: row.id,
      publicId: parsePublicUserId(row.publicId),
      login: row.login,
      loginNormalized: row.loginNormalized,
      state: row.state,
      roles: row.roles.map((r) => r.role),
      credential,
    };
  }

  private readonly include = {
    credential: { select: { algorithm: true, parameters: true, hash: true } },
    roles: { select: { role: true } },
  } as const;

  async findAuthCandidateByNormalizedLogin(loginNormalized: string): Promise<AuthCandidate | null> {
    const row = await this.prisma.user.findUnique({
      where: { loginNormalized },
      include: this.include,
    });
    return row ? this.toCandidate(row as UserRow) : null;
  }

  async findById(userId: string): Promise<AuthCandidate | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      include: this.include,
    });
    return row ? this.toCandidate(row as UserRow) : null;
  }

  async findRolesByUserId(userId: string): Promise<Role[]> {
    const rows = await this.prisma.userRoleAssignment.findMany({
      where: { userId },
      select: { role: true },
    });
    return rows.map((r) => r.role);
  }
}

/**
 * Coerce the JSONB `parameters` column into the integer map the domain expects.
 * Non-integer/absent values are dropped; the hasher only needs the numeric
 * cost factors it persisted.
 */
function normalizeParameters(raw: unknown): Record<string, number> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isInteger(value)) out[key] = value;
  }
  return out;
}
