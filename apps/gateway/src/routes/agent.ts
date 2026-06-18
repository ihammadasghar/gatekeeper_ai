import { Router } from 'express';
import { tryCatch } from '../lib/async-handler.js';

export interface AgentRouterDeps {
  readonly [key: string]: never;
}

export function createAgentRouter(_deps: AgentRouterDeps = {} as AgentRouterDeps): Router {
  const router = Router();

  router.get(
    '/connect/:sessionId',
    tryCatch(async (_req, res) => {
      res.status(501).json({ error: 'Not Implemented', status: 501 });
    }),
  );

  return router;
}
