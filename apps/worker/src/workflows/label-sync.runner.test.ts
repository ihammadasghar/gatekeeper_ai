import { describe, expect, it, vi } from 'vitest';
import { LabelSyncRunner, type IGitHubLabelService, type LabelSyncPayload } from './label-sync.runner';
import type { IRepositoryLabelRepository, ISyncEventRepository, LabelInput } from '@gatekeeper/types';
import type { IWorkflowStep } from './delta-sync.runner';

const makeStep = (): IWorkflowStep => ({
  do: async <T>(_name: string, fn: () => Promise<T>) => fn(),
});

const makeLabelRepo = (): IRepositoryLabelRepository => ({
  upsertAll: vi.fn().mockResolvedValue(undefined),
  findByRepository: vi.fn().mockResolvedValue([]),
});

const makeSyncEventRepo = (): ISyncEventRepository => ({
  create: vi.fn(),
  updateStatus: vi.fn().mockResolvedValue(undefined),
  findByRepository: vi.fn(),
});

const makeGitHub = (labels: LabelInput[] = []): IGitHubLabelService => ({
  fetchAllLabels: vi.fn().mockResolvedValue(labels),
});

const BASE_PAYLOAD: LabelSyncPayload = {
  repositoryId: 'repo-uuid-1',
  owner: 'acme',
  repo: 'backend',
  installationId: 'inst-1',
  syncEventId: 'event-uuid-1',
};

describe('LabelSyncRunner', () => {
  describe('run()', () => {
    it('fetches labels from GitHub and upserts them into the repository', async () => {
      // Arrange
      const labels: LabelInput[] = [
        { name: 'bug', color: 'fc2929', description: 'Something broke' },
        { name: 'enhancement', color: '84b6eb' },
      ];
      const labelRepo = makeLabelRepo();
      const runner = new LabelSyncRunner(labelRepo, makeSyncEventRepo(), makeGitHub(labels));

      // Act
      await runner.run(makeStep(), BASE_PAYLOAD);

      // Assert
      expect(labelRepo.upsertAll).toHaveBeenCalledOnce();
      expect(labelRepo.upsertAll).toHaveBeenCalledWith('repo-uuid-1', labels);
    });

    it('calls fetchAllLabels with the correct owner and repo', async () => {
      // Arrange
      const github = makeGitHub();
      const runner = new LabelSyncRunner(makeLabelRepo(), makeSyncEventRepo(), github);

      // Act
      await runner.run(makeStep(), BASE_PAYLOAD);

      // Assert
      expect(github.fetchAllLabels).toHaveBeenCalledWith('acme', 'backend');
    });

    it('marks the SyncEvent as completed after all steps', async () => {
      // Arrange
      const syncEventRepo = makeSyncEventRepo();
      const runner = new LabelSyncRunner(makeLabelRepo(), syncEventRepo, makeGitHub());

      // Act
      await runner.run(makeStep(), BASE_PAYLOAD);

      // Assert
      expect(syncEventRepo.updateStatus).toHaveBeenCalledWith('event-uuid-1', 'completed');
    });

    it('upserts before marking the event complete', async () => {
      // Arrange
      const callOrder: string[] = [];
      const labelRepo: IRepositoryLabelRepository = {
        upsertAll: vi.fn().mockImplementation(async () => { callOrder.push('upsertAll'); }),
        findByRepository: vi.fn(),
      };
      const syncEventRepo: ISyncEventRepository = {
        create: vi.fn(),
        updateStatus: vi.fn().mockImplementation(async () => { callOrder.push('updateStatus'); }),
        findByRepository: vi.fn(),
      };
      const runner = new LabelSyncRunner(labelRepo, syncEventRepo, makeGitHub([{ name: 'bug', color: 'fc2929' }]));

      // Act
      await runner.run(makeStep(), BASE_PAYLOAD);

      // Assert — upsert must precede the status update
      expect(callOrder).toEqual(['upsertAll', 'updateStatus']);
    });
  });
});
