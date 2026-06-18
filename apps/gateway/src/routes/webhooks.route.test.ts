import { createHmac } from 'crypto';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { ISyncEventService, IWorkflowClient, SyncEvent, SyncEventType } from '@gatekeeper/types';
import { WebhookHandler } from '../handlers/webhook-handler.js';
import { errorHandler } from '../middleware/error-handler.js';
import { createWebhooksRouter } from './webhooks.js';

const SECRET = 'test-webhook-secret';

function sign(body: string): string {
  return `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;
}

function buildTestApp(handler: WebhookHandler): express.Application {
  const app = express();
  app.use('/api/v1/webhooks', express.raw({ type: '*/*' }));
  app.use(express.json());
  app.use('/api/v1/webhooks', createWebhooksRouter({ webhookSecret: SECRET, handler }));
  app.use(errorHandler);
  return app;
}

function mockWorkflowClient(): IWorkflowClient {
  return { enqueue: vi.fn().mockResolvedValue(undefined) };
}

function mockSyncEventService(): ISyncEventService {
  const mockEvent: SyncEvent = {
    id: 'evt-1',
    type: 'DELTA_SYNC',
    status: 'pending',
    payload: '{}',
    repositoryId: null,
    createdAt: new Date().toISOString(),
  };
  return { create: vi.fn().mockResolvedValue(mockEvent) };
}

const PUSH_PAYLOAD = {
  ref: 'refs/heads/main',
  repository: { default_branch: 'main' },
};

const ISSUES_PAYLOAD = {
  action: 'opened',
  issue: { number: 1, title: 'Bug' },
};

describe('POST /api/v1/webhooks/github', () => {
  it('accepts a valid push event targeting the default branch and enqueues DELTA_SYNC', async () => {
    const workflowClient = mockWorkflowClient();
    const syncEventService = mockSyncEventService();
    const handler = new WebhookHandler(workflowClient, syncEventService);
    const app = buildTestApp(handler);

    const body = JSON.stringify(PUSH_PAYLOAD);
    const res = await request(app)
      .post('/api/v1/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'push')
      .set('x-hub-signature-256', sign(body))
      .send(body);

    expect(res.status).toBe(202);
    expect(workflowClient.enqueue).toHaveBeenCalledWith('DELTA_SYNC', PUSH_PAYLOAD);
    expect(syncEventService.create).toHaveBeenCalledWith('DELTA_SYNC', PUSH_PAYLOAD);
  });

  it('returns 401 when signature is invalid', async () => {
    const workflowClient = mockWorkflowClient();
    const syncEventService = mockSyncEventService();
    const handler = new WebhookHandler(workflowClient, syncEventService);
    const app = buildTestApp(handler);

    const body = JSON.stringify(PUSH_PAYLOAD);
    const res = await request(app)
      .post('/api/v1/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'push')
      .set('x-hub-signature-256', 'sha256=invalidsignature')
      .send(body);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Invalid signature' });
    expect(workflowClient.enqueue).not.toHaveBeenCalled();
  });

  it('returns 202 for unsupported event type without enqueuing a job', async () => {
    const workflowClient = mockWorkflowClient();
    const syncEventService = mockSyncEventService();
    const handler = new WebhookHandler(workflowClient, syncEventService);
    const app = buildTestApp(handler);

    const body = JSON.stringify({ action: 'created' });
    const res = await request(app)
      .post('/api/v1/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'installation')
      .set('x-hub-signature-256', sign(body))
      .send(body);

    expect(res.status).toBe(202);
    expect(workflowClient.enqueue).not.toHaveBeenCalled();
  });

  it('accepts an issues event and enqueues ISSUE_SYNC', async () => {
    const workflowClient = mockWorkflowClient();
    const syncEventService = mockSyncEventService();
    const handler = new WebhookHandler(workflowClient, syncEventService);
    const app = buildTestApp(handler);

    const body = JSON.stringify(ISSUES_PAYLOAD);
    const res = await request(app)
      .post('/api/v1/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'issues')
      .set('x-hub-signature-256', sign(body))
      .send(body);

    expect(res.status).toBe(202);
    expect(workflowClient.enqueue).toHaveBeenCalledWith('ISSUE_SYNC', ISSUES_PAYLOAD);
  });

  it('returns 401 when x-hub-signature-256 header is missing', async () => {
    const workflowClient = mockWorkflowClient();
    const syncEventService = mockSyncEventService();
    const handler = new WebhookHandler(workflowClient, syncEventService);
    const app = buildTestApp(handler);

    const body = JSON.stringify(PUSH_PAYLOAD);
    const res = await request(app)
      .post('/api/v1/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'push')
      .send(body);

    expect(res.status).toBe(401);
  });
});
