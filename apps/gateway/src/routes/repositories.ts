import type { IChatSessionService, IRepositoryService, IWorkflowClient } from '@gatekeeper/types';
import { Router } from 'express';
import { tryCatch } from '../lib/async-handler.js';
import type { createAuthMiddleware } from '../middleware/auth.js';

export interface RepositoriesRouterDeps {
  readonly authMiddleware: ReturnType<typeof createAuthMiddleware>;
  readonly repoService: IRepositoryService;
  readonly chatSessionService: IChatSessionService;
  readonly workflowClient: IWorkflowClient;
}

interface CreateRepositoryBody {
  readonly githubRepoId?: unknown;
  readonly owner?: unknown;
  readonly name?: unknown;
  readonly installationId?: unknown;
}

export function createRepositoriesRouter(deps: RepositoriesRouterDeps): Router {
  const router = Router();
  const { authMiddleware, repoService, chatSessionService, workflowClient } = deps;

  router.get(
    '/',
    authMiddleware,
    tryCatch(async (req, res) => {
      const repositories = await repoService.findByUser(req.user!.id);
      res.json({ repositories });
    }),
  );

  router.post(
    '/',
    authMiddleware,
    tryCatch(async (req, res) => {
      const body = req.body as CreateRepositoryBody;
      const { githubRepoId, owner, name, installationId } = body;

      if (
        typeof githubRepoId !== 'string' ||
        typeof owner !== 'string' ||
        typeof name !== 'string' ||
        typeof installationId !== 'string'
      ) {
        res.status(400).json({ error: 'Missing required fields', status: 400 });
        return;
      }

      const repository = await repoService.create({
        userId: req.user!.id,
        githubRepoId,
        owner,
        name,
        installationId,
      });

      await workflowClient.enqueue('COLD_START', { repositoryId: repository.id });

      res.status(201).json({ repository });
    }),
  );

  router.get(
    '/:repoId/sessions',
    authMiddleware,
    tryCatch(async (req, res) => {
      const repoId = Array.isArray(req.params['repoId'])
        ? req.params['repoId'][0]
        : (req.params['repoId'] ?? '');

      const repository = await repoService.findById(repoId);

      if (!repository) {
        res.status(404).json({ error: 'Repository not found', status: 404 });
        return;
      }

      if (repository.userId !== req.user!.id) {
        res.status(403).json({ error: 'Forbidden', status: 403 });
        return;
      }

      const sessions = await chatSessionService.findByRepository(repoId);
      res.json({ sessions });
    }),
  );

  return router;
}

