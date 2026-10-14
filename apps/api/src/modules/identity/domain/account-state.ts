/**
 * Account lifecycle states (CLP-00-05; ADR-004).
 *
 * CP-00 limits an account to exactly these three states. The values mirror the
 * `AccountState` Prisma enum 1:1 so persistence and domain never drift.
 *
 *  - `PENDING`  — created but not yet activated (e.g. awaiting invitation
 *                 acceptance / bootstrap). Cannot authenticate (CLP-00-06).
 *  - `ACTIVE`   — fully usable account.
 *  - `DISABLED` — access revoked. Any lifecycle change that alters access must
 *                 invalidate sessions (ADR-003; enforced in CLP-00-06).
 */
export const ACCOUNT_STATES = ['PENDING', 'ACTIVE', 'DISABLED'] as const;

export type AccountState = (typeof ACCOUNT_STATES)[number];

/** Type guard: is `value` an approved CP-00 account state? */
export function isAccountState(value: unknown): value is AccountState {
  return typeof value === 'string' && (ACCOUNT_STATES as readonly string[]).includes(value);
}

/**
 * Only an `ACTIVE` account may authenticate. `PENDING` and `DISABLED` are both
 * rejected at the domain level, independently of any HTTP/session behavior.
 */
export function isAuthenticatable(state: AccountState): boolean {
  return state === 'ACTIVE';
}
