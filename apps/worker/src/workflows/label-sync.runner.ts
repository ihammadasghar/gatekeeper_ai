import type { IRepositoryLabelRepository, ISyncEventRepository, LabelInput } from '@gatekeeper/types';
import type { IWorkflowStep } from './delta-sync.runner';

export interface LabelSyncPayload {
  readonly repositoryId: string;
  readonly owner: string;
  readonly repo: string;
  readonly installationId: string;
  readonly syncEventId: string;
}

export interface IGitHubLabelService {
  fetchAllLabels(owner: string, repo: string): Promise<LabelInput[]>;
}

export class LabelSyncRunner {
  constructor(
    private readonly labelRepo: IRepositoryLabelRepository,
    private readonly syncEventRepo: ISyncEventRepository,
    private readonly github: IGitHubLabelService,
  ) {}

  async run(step: IWorkflowStep, payload: LabelSyncPayload): Promise<void> {
    await step.do('fetch-and-store-labels', async () => {
      const labels = await this.github.fetchAllLabels(payload.owner, payload.repo);
      await this.labelRepo.upsertAll(payload.repositoryId, labels);
    });

    await step.do('update-sync-event', () =>
      this.syncEventRepo.updateStatus(payload.syncEventId, 'completed'),
    );
  }
}
