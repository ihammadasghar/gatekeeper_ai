import { Router } from 'express';
import { tryCatch } from '../lib/async-handler.js';
import type { IAuthService } from '../services/auth.service.js';

const COOKIE_NAME = 'gatekeeper_session';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface AuthRouterDeps {
  readonly authService: IAuthService;
}

export function createAuthRouter(deps: AuthRouterDeps): Router {
  const router = Router();
  const { authService } = deps;

  router.get('/github', (_req, res) => {
    res.redirect(authService.getOAuthUrl());
  });

  router.get(
    '/github/callback',
    tryCatch(async (req, res) => {
      const code = req.query['code'];

      if (typeof code !== 'string' || !code) {
        res.status(400).json({ error: 'Missing code parameter', status: 400 });
        return;
      }

      const { userId } = await authService.handleCallback(code);
      const frontendUrl = process.env['FRONTEND_URL'] ?? 'http://localhost:3000';

      res.cookie(COOKIE_NAME, userId, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: COOKIE_MAX_AGE_MS,
        secure: process.env['NODE_ENV'] === 'production',
      });

      res.redirect(`${frontendUrl}/dashboard`);
    }),
  );

  return router;
}

