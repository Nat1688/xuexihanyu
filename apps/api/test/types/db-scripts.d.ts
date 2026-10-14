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
