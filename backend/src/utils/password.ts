import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing with argon2id (PRD §6). Uses @node-rs/argon2 — a prebuilt
 * Rust binding, so no node-gyp/native build step is required.
 */
const options = {
  // OWASP-ish defaults, modest for a 2 GB VPS.
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, options);
}

export function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  return verify(hashed, plain, options);
}
