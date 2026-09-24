import { Request, Response, NextFunction } from 'express';
import { validateSession } from '../services/authService.js';
import { User } from '../repositories/types.js';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: User;
      sessionToken?: string;
    }
  }
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;

  cookieHeader.split(';').forEach((cookie) => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    if (!value) return;
    list[name] = decodeURIComponent(value);
  });

  return list;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies['sessionId'];

  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;

  const token = cookieToken || bearerToken;
  if (!token) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication session required.',
      },
    });
    return;
  }

  const user = await validateSession(token);
  if (!user) {
    res.status(401).json({
      error: {
        code: 'SESSION_EXPIRED',
        message: 'Your session has expired or is invalid. Please log in again.',
      },
    });
    return;
  }

  req.user = user;
  req.sessionToken = token;
  next();
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies['sessionId'];

  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;

  const token = cookieToken || bearerToken;
  if (token) {
    const user = await validateSession(token);
    if (user) {
      req.user = user;
      req.sessionToken = token;
    }
  }

  next();
}
