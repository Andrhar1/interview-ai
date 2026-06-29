import { query } from '../../config/db.js';
import { AppError } from '../../middleware/errorHandler.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import type { RegisterInput, LoginInput } from './auth.schema.js';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

interface UserRow extends PublicUser {
  password_hash: string;
}

function toPublic(u: UserRow): PublicUser {
  return { id: u.id, email: u.email, name: u.name, created_at: u.created_at };
}

export async function registerUser(input: RegisterInput): Promise<PublicUser> {
  const existing = await query('SELECT 1 FROM users WHERE email = $1', [input.email]);
  if (existing.rowCount && existing.rowCount > 0) {
    throw new AppError(409, 'Email sudah terdaftar.');
  }

  const passwordHash = await hashPassword(input.password);
  const { rows } = await query<UserRow>(
    `INSERT INTO users (email, password_hash, name)
     VALUES ($1, $2, $3)
     RETURNING id, email, name, password_hash, created_at`,
    [input.email, passwordHash, input.name],
  );
  return toPublic(rows[0]);
}

export async function authenticateUser(input: LoginInput): Promise<PublicUser> {
  const { rows } = await query<UserRow>(
    'SELECT id, email, name, password_hash, created_at FROM users WHERE email = $1',
    [input.email],
  );
  const user = rows[0];
  // Constant-ish failure: same error whether email missing or password wrong.
  if (!user || !(await verifyPassword(user.password_hash, input.password))) {
    throw new AppError(401, 'Email atau kata sandi salah.');
  }
  return toPublic(user);
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  const { rows } = await query<UserRow>(
    'SELECT id, email, name, password_hash, created_at FROM users WHERE id = $1',
    [id],
  );
  return rows[0] ? toPublic(rows[0]) : null;
}
