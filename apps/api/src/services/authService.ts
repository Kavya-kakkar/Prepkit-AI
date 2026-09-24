import crypto from 'node:crypto';
import { db } from '../repositories/db.js';
import { User, Session } from '../repositories/types.js';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  const checkHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(checkHash, 'hex'), Buffer.from(hash, 'hex'));
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function registerUser(email: string, password: string): Promise<User> {
  const existing = await db.findUserByEmail(email);
  if (existing) {
    throw new Error('EMAIL_EXISTS: An account with this email already exists.');
  }

  const { salt, hash } = hashPassword(password);
  const user: User = {
    id: `user-${crypto.randomUUID()}`,
    email: email.toLowerCase().trim(),
    passwordHash: hash,
    salt,
    createdAt: new Date().toISOString(),
  };

  return await db.createUser(user);
}

export async function loginUser(email: string, password: string): Promise<{ user: User; sessionToken: string }> {
  const user = await db.findUserByEmail(email);
  if (!user) {
    throw new Error('INVALID_CREDENTIALS: Invalid email or password.');
  }

  const isValid = verifyPassword(password, user.salt, user.passwordHash);
  if (!isValid) {
    throw new Error('INVALID_CREDENTIALS: Invalid email or password.');
  }

  const sessionToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(sessionToken);

  const session: Session = {
    tokenHash,
    userId: user.id,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    createdAt: new Date().toISOString(),
  };

  await db.createSession(session);
  return { user, sessionToken };
}

export async function validateSession(sessionToken: string): Promise<User | null> {
  if (!sessionToken) return null;

  const tokenHash = hashToken(sessionToken);
  const session = await db.findSession(tokenHash);
  if (!session) return null;

  return await db.findUserById(session.userId);
}

export async function logoutUser(sessionToken: string): Promise<boolean> {
  if (!sessionToken) return false;
  const tokenHash = hashToken(sessionToken);
  return await db.deleteSession(tokenHash);
}
