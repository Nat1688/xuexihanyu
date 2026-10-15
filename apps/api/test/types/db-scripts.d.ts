/**
 * Module declarations for the repo-level CommonJS database tooling
 * (CLP-00-04). These scripts are dependency-free `.cjs` files under
 * `scripts/db/`; tests import them for pure-logic coverage. Declaring the
 * surface here keeps `tsc --noEmit` satisfied without compiling the scripts.
 */

declare module '*/db-url.cjs' {
  export const DEV_DB_NAME: string;
  export const TEST_DB_NAME: string;
  export const LOCAL_HOSTS: Set<string>;
  export const RESETTABLE_DB_NAMES: Set<string>;

  export class DbUrlError extends Error {}

  export interface DbUrlInfo {
    raw: string;
    protocol: string;
    username: string | null;
    password: string | null;
    host: string;
    port: string;
    database: string;
    kind: 'development' | 'test' | 'other';
    isLocal: boolean;
  }

  export function classifyUrl(raw: string | undefined): DbUrlInfo;
  export function safeTarget(raw: string): string;
  export function assertResettable(
    raw: string,
    options?: { confirm?: boolean },
  ):
    | { allowed: true; target: string; info: DbUrlInfo }
    | { allowed: false; reason: string; target: string };
}

declare module '*/env.cjs' {
  export const REPO_ROOT: string;
  export const ENV_FILE: string;
  export const DATABASE_URL_KEYS: Readonly<{ dev: string; test: string }>;
  export function parseEnvFile(filePath: string): Record<string, string>;
  export function resolveKey(key: string, fileEnv?: Record<string, string>): string | undefined;
  export function getUrl(which: 'dev' | 'test'): string | undefined;
}

declare module '*/db-reset-guard.cjs' {
  export interface ResetGuardArgs {
    env: string;
    dryRun: boolean;
    yes: boolean;
    help?: boolean;
    envExplicit?: boolean;
  }
  export function parseArgs(argv: string[]): ResetGuardArgs;
}

declare module '*/seed-guard.cjs' {
  export const SEEDABLE_DB_NAMES: readonly string[];
  export const SYNTHETIC_LOGIN_DOMAIN: string;
  export const BOOTSTRAP_LOGIN_ENV: string;
  export const BOOTSTRAP_PASSWORD_ENV: string;
  export const BOOTSTRAP_PASSWORD_ENV_FILE: string;

  export function assertSeedable(
    raw: string | undefined,
  ):
    | { allowed: true; target: string; info: unknown }
    | { allowed: false; reason: string; target: string };

  export function isSyntheticLogin(login: unknown): boolean;
  export function syntheticLogin(local: string): string;

  export function assertBootstrappable(input: {
    url: string | undefined;
    login: unknown;
    password: unknown;
    minPasswordLength?: number;
  }):
    | { allowed: true; target: string; login: string; info: unknown }
    | { allowed: false; reason: string; target: string };

  export function assertNoExistingAdmin(input: {
    existingAdminCount: number;
  }): { allowed: true } | { allowed: false; reason: string };
}

declare module '*/synthetic-fixtures.cjs' {
  export const SYNTHETIC_SALT: string;
  export const SYNTHETIC_FIXTURES: ReadonlyArray<{
    key: string;
    roles: string[];
    state: string;
  }>;
  export function deriveSyntheticPassword(key: string): string;
  export function resolveFixture(fixture: { key: string; roles: string[]; state: string }): {
    key: string;
    login: string;
    roles: string[];
    state: string;
    password: string;
  };
  export function resolveAllFixtures(): Array<{
    key: string;
    login: string;
    roles: string[];
    state: string;
    password: string;
  }>;
}

declare module '*/scrypt-hash.cjs' {
  export const SCRYPT_PARAMS: Readonly<{
    N: number;
    r: number;
    p: number;
    keylen: number;
    saltLength: number;
  }>;
  export function hashPassword(
    plain: string,
    params?: { N?: number; r?: number; p?: number; keylen?: number; saltLength?: number },
  ): string;
  export function hashParameters(params?: {
    N?: number;
    r?: number;
    p?: number;
    keylen?: number;
  }): { N: number; r: number; p: number; keylen: number };
}

declare module '*/db-seed-synthetic.cjs' {
  export function parseArgs(argv: string[]): { env: string; dryRun: boolean };
  export function ensureFixture(
    prisma: unknown,
    fixture: { key: string; login: string; roles: string[]; state: string; password: string },
  ): Promise<{ key: string; action: string; userId: string }>;
  export function main(): Promise<void>;
}

declare module '*/db-bootstrap-admin.cjs' {
  export function parseArgs(argv: string[]): { env: string; dryRun: boolean };
  export function loadSecret(): string | undefined;
  export function main(): Promise<void>;
}
