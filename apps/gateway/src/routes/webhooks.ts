import { createHmac, timingSafeEqual } from 'crypto';
import { Router } from 'express';
import { tryCatch } from '../lib/async-handler.js';
import type { WebhookHandler } from '../handlers/webhook-handler.js';

export interface WebhooksRouterDeps {
  readonly webhookSecret: string;
  readonly handler: WebhookHandler;
}

function verifySignature(
  rawBody: Buffer,
  secret: string,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

export function createWebhooksRouter(deps: WebhooksRouterDeps): Router {
  const router = Router();
  const { webhookSecret, handler } = deps;

  router.post(
    '/github',
    tryCatch(async (req, res) => {
      const rawBody = req.body as Buffer;
      const signature = req.headers['x-hub-signature-256'] as string | undefined;

      if (!verifySignature(rawBody, webhookSecret, signature)) {
        res.status(401).json({ error: 'Invalid signature', status: 401 });
        return;
      }

      const eventType = req.headers['x-github-event'] as string | undefined;
      const payload = JSON.parse(rawBody.toString('utf-8')) as Record<string, unknown>;

      if (eventType) {
        await handler.handle(eventType, payload);
      }

      res.status(202).json({ status: 'accepted' });
    }),
  );

  return router;
}

