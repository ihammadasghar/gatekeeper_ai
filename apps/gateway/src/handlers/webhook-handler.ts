import type {
  ISyncEventService,
  IWorkflowClient,
  SyncEventType,
} from '@gatekeeper/types';

interface PushPayload {
  readonly ref: string;
  readonly repository: {
    readonly default_branch: string;
    readonly [key: string]: unknown;
  };
  readonly [key: string]: unknown;
}

interface GitHubEventPayload {
  readonly [key: string]: unknown;
}

function isPushPayload(payload: GitHubEventPayload): payload is PushPayload {
  return (
    typeof payload['ref'] === 'string' &&
    typeof (payload['repository'] as Record<string, unknown> | undefined)?.[
      'default_branch'
    ] === 'string'
  );
}

export class WebhookHandler {
  constructor(
    private readonly workflowClient: IWorkflowClient,
    private readonly syncEventService: ISyncEventService,
  ) {}

  async handle(
    eventType: string,
    payload: GitHubEventPayload,
  ): Promise<SyncEventType | null> {
    const jobType = this.resolveJobType(eventType, payload);

    await this.syncEventService.create(
      jobType ?? 'DELTA_SYNC',
      payload,
    );

    if (jobType !== null) {
      await this.workflowClient.enqueue(jobType, payload);
    }

    return jobType;
  }

  private resolveJobType(
    eventType: string,
    payload: GitHubEventPayload,
  ): SyncEventType | null {
    switch (eventType) {
      case 'push': {
        if (!isPushPayload(payload)) return null;
        const defaultRef = `refs/heads/${payload.repository.default_branch}`;
        return payload.ref === defaultRef ? 'DELTA_SYNC' : null;
      }
      case 'issues':
        return 'ISSUE_SYNC';
      case 'label':
        return 'LABEL_SYNC';
      default:
        return null;
    }
  }
}
