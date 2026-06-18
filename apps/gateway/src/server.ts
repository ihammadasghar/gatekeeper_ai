import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Application } from 'express';
import morgan from 'morgan';
import { CloudflareWorkflowClient } from './clients/workflow.client.js';
import { WebhookHandler } from './handlers/webhook-handler.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { D1UserRepository } from './repositories/user.repository.js';
import { createAgentRouter } from './routes/agent.js';
import { createAuthRouter } from './routes/auth.js';
import { createRepositoriesRouter } from './routes/repositories.js';
import { createWebhooksRouter } from './routes/webhooks.js';
import { GitHubAuthService } from './services/auth.service.js';
import { D1ChatSessionService } from './services/chat-session.service.js';
import { D1RepositoryService } from './services/repository.service.js';
import { D1SyncEventService } from './services/sync-event.service.js';

export function createApp(): Application {
  const app = express();
  const frontendUrl = process.env['FRONTEND_URL'] ?? 'http://localhost:3000';

  app.use(morgan('combined'));
  app.use(cors({ origin: frontendUrl, credentials: true }));

  // Raw body for webhook HMAC verification — must be registered BEFORE express.json()
  app.use('/api/v1/webhooks', express.raw({ type: '*/*' }));
  app.use(express.json());
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const d1Config = {
    accountId: process.env['CLOUDFLARE_ACCOUNT_ID'] ?? '',
    apiToken: process.env['CLOUDFLARE_API_TOKEN'] ?? '',
    databaseId: process.env['D1_DATABASE_ID'] ?? '',
  };

  const userRepo = new D1UserRepository(d1Config);
  const authService = new GitHubAuthService(userRepo, {
    clientId: process.env['GITHUB_CLIENT_ID'] ?? '',
    clientSecret: process.env['GITHUB_CLIENT_SECRET'] ?? '',
    frontendUrl,
  });
  const authMiddleware = createAuthMiddleware(userRepo);

  const repoService = new D1RepositoryService(d1Config);
  const chatSessionService = new D1ChatSessionService(d1Config);

  const workflowClient = new CloudflareWorkflowClient({
    accountId: d1Config.accountId,
    apiToken: d1Config.apiToken,
    workflowName: process.env['CLOUDFLARE_WORKFLOW_NAME'] ?? 'gatekeeper-ingestion',
  });
  const syncEventService = new D1SyncEventService(d1Config);
  const webhookHandler = new WebhookHandler(workflowClient, syncEventService);

  app.use('/api/v1/auth', createAuthRouter({ authService }));
  app.use(
    '/api/v1/repositories',
    createRepositoriesRouter({ authMiddleware, repoService, chatSessionService, workflowClient }),
  );
  app.use('/api/v1/agent', createAgentRouter());
  app.use(
    '/api/v1/webhooks',
    createWebhooksRouter({
      webhookSecret: process.env['GITHUB_WEBHOOK_SECRET'] ?? '',
      handler: webhookHandler,
    }),
  );

  app.use(errorHandler);

  return app;
}

export function startServer(): void {
  const port = process.env['PORT'] ?? '3001';
  const app = createApp();

  app.listen(Number(port), () => {
    console.log(`Gateway listening on http://localhost:${port}`);
  });
}

