import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { registerUser, loginUser, logoutUser } from '../services/authService.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

const AuthInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

authRouter.post('/register', async (req: Request, res: Response, next) => {
  try {
    const { email, password } = AuthInputSchema.parse(req.body);
    const user = await registerUser(email, password);
    const { sessionToken } = await loginUser(email, password);

    res.cookie('sessionId', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      user: { id: user.id, email: user.email },
      sessionToken,
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', async (req: Request, res: Response, next) => {
  try {
    const { email, password } = AuthInputSchema.parse(req.body);
    const { user, sessionToken } = await loginUser(email, password);

    res.cookie('sessionId', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      user: { id: user.id, email: user.email },
      sessionToken,
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', requireAuth, async (req: Request, res: Response, next) => {
  try {
    if (req.sessionToken) {
      await logoutUser(req.sessionToken);
    }
    res.clearCookie('sessionId', { path: '/' });
    res.json({ status: 'ok', message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  res.json({
    user: {
      id: req.user!.id,
      email: req.user!.email,
    },
  });
});
