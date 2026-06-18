export type SyncEventType = 'COLD_START' | 'DELTA_SYNC' | 'ISSUE_SYNC' | 'LABEL_SYNC';

export type SyncEventStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface SyncEvent {
  readonly id: string;
  readonly type: SyncEventType;
  readonly status: SyncEventStatus;
  readonly payload: string;
  readonly repositoryId: string | null;
  readonly createdAt: string;
}

export interface CreateSyncEventDTO {
  readonly type: SyncEventType;
  readonly repositoryId: string | null;
  readonly payload: unknown;
}

export interface IWorkflowClient {
  enqueue(eventType: SyncEventType, payload: unknown): Promise<void>;
}

export interface ISyncEventService {
  create(type: SyncEventType, payload: unknown): Promise<SyncEvent>;
}

export interface ISyncEventRepository {
  create(dto: CreateSyncEventDTO): Promise<SyncEvent>;
  updateStatus(id: string, status: SyncEventStatus): Promise<void>;
  findByRepository(repoId: string): Promise<SyncEvent[]>;
}
