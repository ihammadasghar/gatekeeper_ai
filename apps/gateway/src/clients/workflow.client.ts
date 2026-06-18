import type { IWorkflowClient, SyncEventType } from '@gatekeeper/types';

export interface WorkflowClientConfig {
  readonly accountId: string;
  readonly apiToken: string;
  readonly workflowName: string;
}

interface CloudflareWorkflowRunResponse {
  readonly success: boolean;
  readonly errors: ReadonlyArray<{ readonly message: string }>;
}

export class CloudflareWorkflowClient implements IWorkflowClient {
  private readonly url: string;
  private readonly headers: Readonly<Record<string, string>>;

  constructor(private readonly config: WorkflowClientConfig) {
    this.url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/workflows/${config.workflowName}/runs`;
    this.headers = {
      'Authorization': `Bearer ${config.apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  async enqueue(eventType: SyncEventType, payload: unknown): Promise<void> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ params: { eventType, payload } }),
    });

    if (!response.ok) {
      throw new Error(`Workflow enqueue failed: ${response.statusText}`);
    }

    const data = (await response.json()) as CloudflareWorkflowRunResponse;

    if (!data.success) {
      throw new Error(
        `Workflow error: ${data.errors.map((e) => e.message).join(', ')}`,
      );
    }
  }
}
