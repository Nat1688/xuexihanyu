/**
 * Minimal Prisma error classification shared by CP-06 adapters.
 *
 * Only the stable Prisma error code is inspected (`P2002` unique constraint);
 * no driver/SQL text ever leaves the adapter. A lost race on a unique
 * constraint becomes a `null` result so the service answers a stable,
 * safe domain error instead of a 500.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}
