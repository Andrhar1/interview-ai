import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Nama wajib diisi').max(100),
  email: z.string().trim().toLowerCase().email('Masukkan email yang valid.'),
  password: z.string().min(6, 'Kata sandi minimal 6 karakter.').max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Masukkan email yang valid.'),
  password: z.string().min(1, 'Kata sandi wajib diisi'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
