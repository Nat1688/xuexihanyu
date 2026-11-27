import { Prisma } from '@prisma/client';

import { PrismaService } from '../../foundation/prisma.service';

/** Root Prisma client or an interactive-transaction client. */
export type MasteryPrismaClient = PrismaService | Prisma.TransactionClient;

export function hasTransactionRunner(client: MasteryPrismaClient): client is PrismaService {
  return '$transaction' in client && typeof client.$transaction === 'function';
}
