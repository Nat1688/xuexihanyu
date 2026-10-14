/**
 * Password hashing boundary tests (CLP-00-05; ADR-004).
 *
 * Verifies the memory-hard scrypt boundary: hashes are non-reversible, the
 * plaintext never appears in the returned value or in any thrown error, two
 * hashes of the same password differ (random salt), verification is correct,
 * and the stored metadata names the algorithm and its memory-hard parameters.
 *
 * Synthetic passwords only. No real credential ever appears.
 */
import {
  InvalidPasswordHashError,
  makePasswordHash,
  PASSWORD_HASH_MAX_LENGTH,
} from '../../src/modules/identity/domain';
import {
  InvalidPasswordError,
  ScryptPasswordHasher,
  SCRYPT_ALGORITHM,
} from '../../src/modules/identity/infrastructure/scrypt-password-hasher';

// Small, fast parameters for tests; still memory-hard scrypt.
const TEST_PARAMS = { N: 1024, r: 8, p: 1, keylen: 32, saltLength: 16 };
const PLAINTEXT = 'synthetic-password-0000';

describe('scrypt password hasher', () => {
  const hasher = new ScryptPasswordHasher(TEST_PARAMS);

  it('names its memory-hard algorithm', () => {
    expect(hasher.algorithm).toBe(SCRYPT_ALGORITHM);
  });

  it('produces a persistable hash named for scrypt with memory-hard params', async () => {
    const stored = await hasher.hash(PLAINTEXT);
    expect(stored.algorithm).toBe('scrypt');
    expect(stored.parameters).toMatchObject({ N: 1024, r: 8, p: 1, keylen: 32 });
    expect(stored.hash.length).toBeGreaterThan(0);
    expect(stored.hash.length).toBeLessThanOrEqual(PASSWORD_HASH_MAX_LENGTH);
    expect(Object.isFrozen(stored)).toBe(true);
  });

  it('never embeds the plaintext in the stored value', async () => {
    const stored = await hasher.hash(PLAINTEXT);
    expect(stored.hash).not.toContain(PLAINTEXT);
    expect(stored.algorithm).not.toContain(PLAINTEXT);
    expect(JSON.stringify(stored)).not.toContain(PLAINTEXT);
  });

  it('produces different hashes for the same password (random salt)', async () => {
    const a = await hasher.hash(PLAINTEXT);
    const b = await hasher.hash(PLAINTEXT);
    expect(a.hash).not.toBe(b.hash);
  });

  it('verifies the correct password and rejects a wrong one', async () => {
    const stored = await hasher.hash(PLAINTEXT);
    await expect(hasher.verify(PLAINTEXT, stored)).resolves.toBe(true);
    await expect(hasher.verify('wrong-password-1111', stored)).resolves.toBe(false);
  });

  it('returns false (never throws) for an unknown algorithm or malformed hash', async () => {
    await expect(
      hasher.verify(PLAINTEXT, makePasswordHash({ algorithm: 'md5', parameters: {}, hash: 'x' })),
    ).resolves.toBe(false);
    await expect(
      hasher.verify(
        PLAINTEXT,
        makePasswordHash({ algorithm: 'scrypt', parameters: {}, hash: 'garbage' }),
      ),
    ).resolves.toBe(false);
  });

  it('does not leak the plaintext in a length-validation error', async () => {
    const secretish = 'a'.repeat(2000); // over max length
    try {
      await hasher.hash(secretish);
      throw new Error('expected hash() to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidPasswordError);
      expect((error as Error).message).not.toContain(secretish.slice(0, 32));
    }
  });

  it('rejects a too-short plaintext', async () => {
    await expect(hasher.hash('short')).rejects.toBeInstanceOf(InvalidPasswordError);
  });
});

describe('password hash value type', () => {
  it('accepts a well-formed hash and freezes it', () => {
    const value = makePasswordHash({ algorithm: 'scrypt', parameters: { N: 1024 }, hash: 'abc' });
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.parameters)).toBe(true);
  });

  it('rejects empty algorithm/hash and non-integer parameters', () => {
    expect(() => makePasswordHash({ algorithm: '', parameters: {}, hash: 'abc' })).toThrow(
      InvalidPasswordHashError,
    );
    expect(() => makePasswordHash({ algorithm: 'scrypt', parameters: {}, hash: '' })).toThrow(
      InvalidPasswordHashError,
    );
    expect(() =>
      makePasswordHash({ algorithm: 'scrypt', parameters: { N: 1.5 }, hash: 'abc' }),
    ).toThrow(InvalidPasswordHashError);
  });
});
