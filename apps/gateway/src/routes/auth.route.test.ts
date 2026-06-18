import type { IUserRepository, User } from '@gatekeeper/types';
import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../middleware/error-handler.js';
import type { IAuthService } from '../services/auth.service.js';
import { createAuthRouter } from './auth.js';

const MOCK_USER: User = {
  id: 'user-uuid-123',
  githubId: '42',
  login: 'octocat',
  name: 'The Octocat',
  email: 'octocat@github.com',
  avatarUrl: 'https://github.com/images/error/octocat_happy.gif',
  accessToken: 'gho_secret',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

function buildTestApp(authService: IAuthService): express.Application {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter({ authService }));
  app.use(errorHandler);
  return app;
}

function mockUserRepo(): IUserRepository {
  return {
    findByGitHubId: vi.fn(),
    findById: vi.fn(),
    upsert: vi.fn(),
  };
}

describe('GET /api/v1/auth/github', () => {
  it('redirects to the GitHub OAuth authorization URL', async () => {
    const authService: IAuthService = {
      getOAuthUrl: () =>
        'https://github.com/login/oauth/authorize?client_id=test_id&scope=read%3Auser%2Crepo',
      handleCallback: vi.fn(),
    };

    const app = buildTestApp(authService);
    const res = await request(app).get('/api/v1/auth/github');

    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe(
      'https://github.com/login/oauth/authorize?client_id=test_id&scope=read%3Auser%2Crepo',
    );
  });
});

describe('GET /api/v1/auth/github/callback', () => {
  it('sets session cookie and redirects to dashboard on valid code', async () => {
    const userRepo = mockUserRepo();
    const authService: IAuthService = {
      getOAuthUrl: vi.fn(),
      handleCallback: vi.fn().mockResolvedValue({ userId: MOCK_USER.id }),
    };

    process.env['FRONTEND_URL'] = 'http://localhost:3000';
    const app = buildTestApp(authService);
    const res = await request(app).get('/api/v1/auth/github/callback?code=valid_code');

    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('http://localhost:3000/dashboard');
    const rawCookie = res.headers['set-cookie'];
    const cookie = (Array.isArray(rawCookie) ? rawCookie[0] : rawCookie) ?? '';
    expect(cookie).toContain('gatekeeper_session=user-uuid-123');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(authService.handleCallback).toHaveBeenCalledWith('valid_code');
    void userRepo; // unused but illustrates the DI pattern
  });

  it('returns 400 when code query param is missing', async () => {
    const authService: IAuthService = {
      getOAuthUrl: vi.fn(),
      handleCallback: vi.fn(),
    };

    const app = buildTestApp(authService);
    const res = await request(app).get('/api/v1/auth/github/callback');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Missing code parameter', status: 400 });
    expect(authService.handleCallback).not.toHaveBeenCalled();
  });

  it('propagates service errors to the error handler', async () => {
    const authService: IAuthService = {
      getOAuthUrl: vi.fn(),
      handleCallback: vi.fn().mockRejectedValue(
        Object.assign(new Error('Bad gateway'), { status: 502 }),
      ),
    };

    const app = buildTestApp(authService);
    const res = await request(app).get('/api/v1/auth/github/callback?code=bad_code');

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ error: 'Bad gateway' });
  });
});
