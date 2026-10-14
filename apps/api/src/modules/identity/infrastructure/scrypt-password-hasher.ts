/**
 * scrypt password hasher (CLP-00-05; ADR-004).
 *
 * Algorithm: **scrypt** (RFC 7914), a modern, memory-hard KDF provided by the
 * Node.js standard library (`node:crypto`). Chosen because it is memory-hard
 * (resists GPU/ASIC parallelism), ships with the runtime (no third-party native
 * build), and is a widely-reviewed, independently-testable primitive.
 *
 * Parameters (memory-hard): N (CPU/memory cost), r (block size), p
 * (parallelism), keylen (derived key length), and a per-hash random salt. N, r,
 * p are persisted in the `parameters` JSON column; the salt is persisted inside
 * the encoded hash string. Verification is constant-time
 * (`crypto.timingSafeEqual`).
 *
 * Encoded hash format (self-describing, salt included):
 *   scrypt$N=<n>,r=<r>,p=<p>$<saltBase64>$<derivedKeyBase64>
 *
 * Defaults follow Node's practical ceiling (maxmem) and a cost that is
 * deliberately slow but serviceable in tests. Production deployments may raise
 * N via constructor options.
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import type { PasswordHasher } from '../application/password-hasher';
import {
  InvalidPasswordHashError,
  makePasswordHash,
  type PasswordHash,
  type PasswordHashParameters,
} from '../domain/password-hash';

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** The algorithm identifier used for every hash produced by this hasher. */
export const SCRYPT_ALGORITHM = 'scrypt';

/** Minimum plaintext password length enforced by the hashing boundary. */
export const PASSWORD_MIN_LENGTH = 8;

/** Maximum accepted plaintext length (avoid pathological inputs). */
export const PASSWORD_MAX_LENGTH = 1024;

/** Cost parameters for {@link ScryptPasswordHasher}. */
export interface ScryptParams {
  /** CPU/memory cost — must be a power of two. */
  N: number;
  /** Block size. */
  r: number;
  /** Parallelism. */
  p: number;
  /** Derived key length in bytes. */
  keylen: number;
  /** Salt length in bytes. */
  saltLength: number;
}

/**
 * Default production-ish parameters: N=2^15 (32768), r=8, p=1, 32-byte key,
 * 16-byte salt. `maxmem` is set generously so the memory cost is not silently
 * truncated by Node's 32 MiB default.
 */
export const DEFAULT_SCRYPT_PARAMS: ScryptParams = Object.freeze({
  N: 32768,
  r: 8,
  p: 1,
  keylen: 32,
  saltLength: 16,
});

/** Raised when a plaintext password fails length/base rules. */
export class InvalidPasswordError extends Error {
  readonly code = 'IDENTITY_INVALID_PASSWORD';
  constructor(reason: string) {
    super(`Invalid password: ${reason}`);
    this.name = 'InvalidPasswordError';
  }
}

function assertValidParams(params: ScryptParams): void {
  if (!Number.isInteger(params.N) || params.N < 2 || (params.N & (params.N - 1)) !== 0) {
    throw new InvalidPasswordHashError('N must be a power of two >= 2');
  }
  for (const key of ['r', 'p', 'keylen', 'saltLength'] as const) {
    if (!Number.isInteger(params[key]) || params[key] <= 0) {
      throw new InvalidPasswordHashError(`parameter ${key} must be a positive integer`);
    }
  }
}

function assertPlaintext(plain: string): void {
  if (typeof plain !== 'string' || plain.length < PASSWORD_MIN_LENGTH) {
    throw new InvalidPasswordError('too short');
  }
  if (plain.length > PASSWORD_MAX_LENGTH) {
    throw new InvalidPasswordError('too long');
  }
}

/**
 * Memory-hard password hasher backed by Node's scrypt.
 */
export class ScryptPasswordHasher implements PasswordHasher {
  readonly algorithm = SCRYPT_ALGORITHM;

  constructor(private readonly params: ScryptParams = DEFAULT_SCRYPT_PARAMS) {
    assertValidParams(this.params);
  }

  async hash(plain: string): Promise<PasswordHash> {
    assertPlaintext(plain);
    const salt = randomBytes(this.params.saltLength);
    const derived = await this.derive(plain, salt, this.params);
    const parameters: PasswordHashParameters = {
      N: this.params.N,
      r: this.params.r,
      p: this.params.p,
      keylen: this.params.keylen,
    };
    const encoded = [
      SCRYPT_ALGORITHM,
      `N=${this.params.N},r=${this.params.r},p=${this.params.p}`,
      salt.toString('base64'),
      derived.toString('base64'),
    ].join('$');
    return makePasswordHash({ algorithm: SCRYPT_ALGORITHM, parameters, hash: encoded });
  }

  async verify(plain: string, stored: PasswordHash): Promise<boolean> {
    if (typeof plain !== 'string' || plain.length === 0) {
      return false;
    }
    if (stored.algorithm !== SCRYPT_ALGORITHM) {
      return false;
    }
    const parsed = this.parse(stored.hash);
    if (!parsed) {
      return false;
    }
    const actual = await this.derive(plain, parsed.salt, {
      ...this.params,
      N: parsed.params.N,
      r: parsed.params.r,
      p: parsed.params.p,
      keylen: parsed.expected.length,
    });
    if (actual.length !== parsed.expected.length) {
      return false;
    }
    return timingSafeEqual(actual, parsed.expected);
  }

  private async derive(plain: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
    // Give scrypt headroom above its intrinsic memory need (128*N*r bytes).
    const intrinsic = 128 * params.N * params.r;
    const maxmem = Math.max(32 * 1024 * 1024, intrinsic * 2);
    return scryptAsync(plain, salt, params.keylen, {
      N: params.N,
      r: params.r,
      p: params.p,
      maxmem,
    });
  }

  /** Parse the self-describing encoded hash. Returns null when malformed. */
  private parse(
    encoded: string,
  ): { params: { N: number; r: number; p: number }; salt: Buffer; expected: Buffer } | null {
    const parts = encoded.split('$');
    if (parts.length !== 4 || parts[0] !== SCRYPT_ALGORITHM) {
      return null;
    }
    const paramMatch = /^N=(\d+),r=(\d+),p=(\d+)$/.exec(parts[1]);
    if (!paramMatch) {
      return null;
    }
    try {
      return {
        params: { N: Number(paramMatch[1]), r: Number(paramMatch[2]), p: Number(paramMatch[3]) },
        salt: Buffer.from(parts[2], 'base64'),
        expected: Buffer.from(parts[3], 'base64'),
      };
    } catch {
      return null;
    }
  }
}
