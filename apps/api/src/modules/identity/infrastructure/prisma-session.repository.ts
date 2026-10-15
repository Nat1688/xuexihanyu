/**
 * Prisma-backed session repository (CLP-00-06; ADR-003).
 *
 * Implements {@link SessionRepository} over the `sessions` table. The adapter is
 * the ONLY place that touches Prisma for sessions; the application layer sees
 * only the port. It maps persisted rows to the domain {@link PersistedSession}
 * shape and never logs tokens/hashes.
 *
 * The `token_hash` column is UNIQUE, so lookup and creation rely on the DB for
 * the security-critical uniqueness (a token collision cannot silently create a
 * second active session).
 */
import { Injectable } from '@nestjs/common';

import {
  type CreateSessionInput,
  type PersistedSession,
  type SessionRepository,
} from '../application/session-repository';
import { type PublicUserId, type SessionTokenHash } from '../domain';
import { parsePublicUserId } from '../domain/public-user-id';
import { PrismaService } from '../../foundation/prisma.service';

/** Shape of a `sessions` row as read through Prisma. */
interface SessionRow {
  id: string;
  userId: string;
  tokenHash: string;
  csrfHash: string;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  user: { publicId: string };
}

@Injectable()
export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toDomain(row: SessionRow): PersistedSession {
    return {
      id: row.id,
      userId: row.userId,
      userPublicId: parsePublicUserId(row.user.publicId) as PublicUserId,
      tokenHash: row.tokenHash as SessionTokenHash,
      csrfHash: row.csrfHash,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
    };
  }

  async findByTokenHash(tokenHash: SessionTokenHash): Promise<PersistedSession | null> {
    const row = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: { select: { publicId: true } } },
    });
    return row ? this.toDomain(row as SessionRow) : null;
  }

  async create(input: CreateSessionInput): Promise<PersistedSession> {
    const row = await this.prisma.session.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        csrfHash: input.csrfHash,
        createdAt: input.createdAt,
        lastUsedAt: input.lastUsedAt,
        expiresAt: input.expiresAt,
      },
      include: { user: { select: { publicId: true } } },
    });
    return this.toDomain(row as SessionRow);
  }

  async touch(sessionId: string, at: Date): Promise<PersistedSession> {
    const row = await this.prisma.session.update({
      where: { id: sessionId },
      data: { lastUsedAt: at },
      include: { user: { select: { publicId: true } } },
    });
    return this.toDomain(row as SessionRow);
  }

  async revoke(sessionId: string, at: Date): Promise<void> {
    // Only set revokedAt if not already revoked, so the FIRST revocation time
    // is preserved (idempotent, monotonic).
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: at },
    });
  }

  async revokeAllForUser(userId: string, at: Date): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: at },
    });
    return result.count;
  }
}
