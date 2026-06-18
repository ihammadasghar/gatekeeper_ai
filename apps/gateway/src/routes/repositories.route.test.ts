import type {
  ChatSession,
  IChatSessionService,
  IRepositoryService,
  IWorkflowClient,
  IUserRepository,
  Repository,
  User,
} from '@gatekeeper/types';
import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createAuthMiddleware } from '../middleware/auth.js';
import { errorHandler } from '../middleware/error-handler.js';
import { createRepositoriesRouter } from './repositories.js';

const MOCK_USER: User = {
  id: 'user-uuid-1',
  githubId: '42',
  login: 'octocat',
  name: 'The Octocat',
  email: null,
  avatarUrl: 'https://example.com/avatar.png',
  accessToken: 'gho_secret',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const MOCK_REPO: Repository = {
  id: 'repo-uuid-1',
  userId: MOCK_USER.id,
  githubRepoId: '12345',
  owner: 'octocat',
  name: 'hello-world',
  installationId: 'install-1',
  syncStatus: 'pending',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const MOCK_SESSION: ChatSession = {
  id: 'session-uuid-1',
  repositoryId: MOCK_REPO.id,
  userId: MOCK_USER.id,
  title: 'Test session',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

function buildTestApp(
  userRepo: IUserRepository,
  repoService: IRepositoryService,
  chatSessionService: IChatSessionService,
  workflowClient: IWorkflowClient,
): express.Application {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  const authMiddleware = createAuthMiddleware(userRepo);
  app.use(
    '/api/v1/repositories',
    createRepositoriesRouter({ authMiddleware, repoService, chatSessionService, workflowClient }),
  );
  app.use(errorHandler);
  return app;
}

function authedRequest(
  app: express.Application,
  method: 'get' | 'post',
  path: string,
): request.Test {
  return request(app)
    [method](path)
    .set('Cookie', `gatekeeper_session=${MOCK_USER.id}`);
}

describe('GET /api/v1/repositories', () => {
  it('returns the authenticated user repositories', async () => {
    const userRepo: IUserRepository = {
      findById: vi.fn().mockResolvedValue(MOCK_USER),
      findByGitHubId: vi.fn(),
      upsert: vi.fn(),
    };
    const repoService: IRepositoryService = {
      findByUser: vi.fn().mockResolvedValue([MOCK_REPO]),
      create: vi.fn(),
      findById: vi.fn(),
      updateSyncStatus: vi.fn(),
    };
    const chatSessionService: IChatSessionService = {
      findByRepository: vi.fn(),
      create: vi.fn(),
    };
    const workflowClient: IWorkflowClient = { enqueue: vi.fn() };

    const app = buildTestApp(userRepo, repoService, chatSessionService, workflowClient);
    const res = await authedRequest(app, 'get', '/api/v1/repositories');

    expect(res.status).toBe(200);
    expect(res.body.repositories).toHaveLength(1);
    expect(res.body.repositories[0].id).toBe(MOCK_REPO.id);
    expect(repoService.findByUser).toHaveBeenCalledWith(MOCK_USER.id);
  });

  it('returns 401 when no session cookie is present', async () => {
    const userRepo: IUserRepository = {
      findById: vi.fn(),
      findByGitHubId: vi.fn(),
      upsert: vi.fn(),
    };
    const repoService: IRepositoryService = {
      findByUser: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      updateSyncStatus: vi.fn(),
    };
    const chatSessionService: IChatSessionService = { findByRepository: vi.fn(), create: vi.fn() };
    const workflowClient: IWorkflowClient = { enqueue: vi.fn() };

    const app = buildTestApp(userRepo, repoService, chatSessionService, workflowClient);
    const res = await request(app).get('/api/v1/repositories');

    expect(res.status).toBe(401);
    expect(repoService.findByUser).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/repositories', () => {
  it('creates a repository and enqueues a COLD_START job', async () => {
    const userRepo: IUserRepository = {
      findById: vi.fn().mockResolvedValue(MOCK_USER),
      findByGitHubId: vi.fn(),
      upsert: vi.fn(),
    };
    const repoService: IRepositoryService = {
      findByUser: vi.fn(),
      create: vi.fn().mockResolvedValue(MOCK_REPO),
      findById: vi.fn(),
      updateSyncStatus: vi.fn(),
    };
    const chatSessionService: IChatSessionService = { findByRepository: vi.fn(), create: vi.fn() };
    const workflowClient: IWorkflowClient = { enqueue: vi.fn().mockResolvedValue(undefined) };

    const app = buildTestApp(userRepo, repoService, chatSessionService, workflowClient);
    const res = await authedRequest(app, 'post', '/api/v1/repositories').send({
      githubRepoId: '12345',
      owner: 'octocat',
      name: 'hello-world',
      installationId: 'install-1',
    });

    expect(res.status).toBe(201);
    expect(res.body.repository.id).toBe(MOCK_REPO.id);
    expect(repoService.create).toHaveBeenCalledWith({
      userId: MOCK_USER.id,
      githubRepoId: '12345',
      owner: 'octocat',
      name: 'hello-world',
      installationId: 'install-1',
    });
    expect(workflowClient.enqueue).toHaveBeenCalledWith('COLD_START', {
      repositoryId: MOCK_REPO.id,
    });
  });
});

describe('GET /api/v1/repositories/:repoId/sessions', () => {
  it('returns sessions for a repository the user owns', async () => {
    const userRepo: IUserRepository = {
      findById: vi.fn().mockResolvedValue(MOCK_USER),
      findByGitHubId: vi.fn(),
      upsert: vi.fn(),
    };
    const repoService: IRepositoryService = {
      findByUser: vi.fn(),
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(MOCK_REPO),
      updateSyncStatus: vi.fn(),
    };
    const chatSessionService: IChatSessionService = {
      findByRepository: vi.fn().mockResolvedValue([MOCK_SESSION]),
      create: vi.fn(),
    };
    const workflowClient: IWorkflowClient = { enqueue: vi.fn() };

    const app = buildTestApp(userRepo, repoService, chatSessionService, workflowClient);
    const res = await authedRequest(app, 'get', `/api/v1/repositories/${MOCK_REPO.id}/sessions`);

    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(1);
    expect(chatSessionService.findByRepository).toHaveBeenCalledWith(MOCK_REPO.id);
  });

  it('returns 403 when the user does not own the repository', async () => {
    const otherUser: User = { ...MOCK_USER, id: 'other-user-uuid' };
    const userRepo: IUserRepository = {
      findById: vi.fn().mockResolvedValue(otherUser),
      findByGitHubId: vi.fn(),
      upsert: vi.fn(),
    };
    const repoService: IRepositoryService = {
      findByUser: vi.fn(),
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(MOCK_REPO),
      updateSyncStatus: vi.fn(),
    };
    const chatSessionService: IChatSessionService = {
      findByRepository: vi.fn(),
      create: vi.fn(),
    };
    const workflowClient: IWorkflowClient = { enqueue: vi.fn() };

    const app = buildTestApp(userRepo, repoService, chatSessionService, workflowClient);
    const res = await request(app)
      .get(`/api/v1/repositories/${MOCK_REPO.id}/sessions`)
      .set('Cookie', `gatekeeper_session=${otherUser.id}`);

    expect(res.status).toBe(403);
    expect(chatSessionService.findByRepository).not.toHaveBeenCalled();
  });
});
