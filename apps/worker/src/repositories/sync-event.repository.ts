import type {
  CreateSyncEventDTO,
  ISyncEventRepository,
  SyncEvent,
  SyncEventStatus,
  SyncEventType,
} from '@gatekeeper/types';
import type { ID1Database } from './user.repository.js';

interface SyncEventRow {
  readonly id: string;
  readonly type: string;
  readonly status: string;
  readonly payload: string;
  readonly repository_id: string | null;
  readonly created_at: string;
}

export class D1SyncEventRepository implements ISyncEventRepository {
  constructor(private readonly db: ID1Database) {}

  async create(dto: CreateSyncEventDTO): Promise<SyncEvent> {
    const now = new Date().toISOString();
    const serializedPayload = JSON.stringify(dto.payload);

    await this.db
      .prepare(
        `INSERT INTO sync_events (id, type, status, payload, repository_id, created_at)
         VALUES (lower(hex(randomblob(16))), ?, 'pending', ?, ?, ?)`,
      )
      .bind(dto.type, serializedPayload, dto.repositoryId, now)
      .run();

    const row = await this.db
      .prepare(
        'SELECT * FROM sync_events WHERE type = ? AND repository_id IS ? ORDER BY rowid DESC LIMIT 1',
      )
      .bind(dto.type, dto.repositoryId)
      .first<SyncEventRow>();

    if (!row) throw new Error('Failed to create SyncEvent');
    return this.mapRow(row);
  }

  async updateStatus(id: string, status: SyncEventStatus): Promise<void> {
    await this.db
      .prepare('UPDATE sync_events SET status = ? WHERE id = ?')
      .bind(status, id)
      .run();
  }

  async findByRepository(repoId: string): Promise<SyncEvent[]> {
    const result = await this.db
      .prepare(
        'SELECT * FROM sync_events WHERE repository_id = ? ORDER BY created_at DESC',
      )
      .bind(repoId)
      .all<SyncEventRow>();

    return result.results.map((row) => this.mapRow(row));
  }

  private mapRow(row: SyncEventRow): SyncEvent {
    return {
      id: row.id,
      type: row.type as SyncEventType,
      status: row.status as SyncEventStatus,
      payload: row.payload,
      repositoryId: row.repository_id,
      createdAt: row.created_at,
    };
  }
}
