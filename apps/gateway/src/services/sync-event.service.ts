import type { ISyncEventService, SyncEvent, SyncEventType } from '@gatekeeper/types';
import type { D1Config } from '../repositories/user.repository.js';

interface SyncEventRow {
  readonly id: string;
  readonly type: string;
  readonly status: string;
  readonly payload: string;
  readonly repository_id: string | null;
  readonly created_at: string;
}

interface D1QueryResult<T> {
  readonly results: T[];
}

interface D1Response<T> {
  readonly result: ReadonlyArray<D1QueryResult<T>>;
  readonly success: boolean;
  readonly errors: ReadonlyArray<{ readonly message: string }>;
}

export class D1SyncEventService implements ISyncEventService {
  private readonly baseUrl: string;
  private readonly headers: Readonly<Record<string, string>>;

  constructor(private readonly config: D1Config) {
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}`;
    this.headers = {
      'Authorization': `Bearer ${config.apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  private async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const response = await fetch(`${this.baseUrl}/query`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ sql, params }),
    });

    if (!response.ok) {
      throw new Error(`D1 query failed: ${response.statusText}`);
    }

    const data = (await response.json()) as D1Response<T>;

    if (!data.success) {
      throw new Error(`D1 error: ${data.errors.map((e) => e.message).join(', ')}`);
    }

    return data.result[0]?.results ?? [];
  }

  async create(type: SyncEventType, payload: unknown): Promise<SyncEvent> {
    const now = new Date().toISOString();
    const serializedPayload = JSON.stringify(payload);

    await this.query(
      `INSERT INTO sync_events (id, type, status, payload, created_at)
       VALUES (lower(hex(randomblob(16))), ?, 'pending', ?, ?)`,
      [type, serializedPayload, now],
    );

    const rows = await this.query<SyncEventRow>(
      `SELECT * FROM sync_events WHERE type = ? AND created_at = ? ORDER BY rowid DESC LIMIT 1`,
      [type, now],
    );

    const row = rows[0];
    if (!row) {
      throw new Error('Failed to create SyncEvent');
    }

    return {
      id: row.id,
      type: row.type as SyncEventType,
      status: row.status as SyncEvent['status'],
      payload: row.payload,
      repositoryId: row.repository_id,
      createdAt: row.created_at,
    };
  }
}
