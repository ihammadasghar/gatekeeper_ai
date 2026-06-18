import type {
  CreateRepositoryDTO,
  IRepositoryService,
  Repository,
  SyncStatus,
} from '@gatekeeper/types';
import type { D1Config } from '../repositories/user.repository.js';

interface D1QueryResult<T> {
  readonly results: T[];
}

interface D1Response<T> {
  readonly result: ReadonlyArray<D1QueryResult<T>>;
  readonly success: boolean;
  readonly errors: ReadonlyArray<{ readonly message: string }>;
}

interface RepositoryRow {
  readonly id: string;
  readonly user_id: string;
  readonly github_repo_id: string;
  readonly owner: string;
  readonly name: string;
  readonly installation_id: string;
  readonly sync_status: string;
  readonly created_at: string;
  readonly updated_at: string;
}

function rowToRepository(row: RepositoryRow): Repository {
  return {
    id: row.id,
    userId: row.user_id,
    githubRepoId: row.github_repo_id,
    owner: row.owner,
    name: row.name,
    installationId: row.installation_id,
    syncStatus: row.sync_status as SyncStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class D1RepositoryService implements IRepositoryService {
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

  async findByUser(userId: string): Promise<Repository[]> {
    const rows = await this.query<RepositoryRow>(
      'SELECT * FROM repositories WHERE user_id = ? ORDER BY created_at DESC',
      [userId],
    );
    return rows.map(rowToRepository);
  }

  async findById(id: string): Promise<Repository | null> {
    const rows = await this.query<RepositoryRow>(
      'SELECT * FROM repositories WHERE id = ? LIMIT 1',
      [id],
    );
    const row = rows[0];
    return row ? rowToRepository(row) : null;
  }

  async create(dto: CreateRepositoryDTO): Promise<Repository> {
    const now = new Date().toISOString();
    await this.query(
      `INSERT INTO repositories (id, user_id, github_repo_id, owner, name, installation_id, sync_status, created_at, updated_at)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [dto.userId, dto.githubRepoId, dto.owner, dto.name, dto.installationId, now, now],
    );

    const rows = await this.query<RepositoryRow>(
      'SELECT * FROM repositories WHERE github_repo_id = ? AND user_id = ? ORDER BY rowid DESC LIMIT 1',
      [dto.githubRepoId, dto.userId],
    );
    const row = rows[0];
    if (!row) throw new Error('Failed to create repository');
    return rowToRepository(row);
  }

  async updateSyncStatus(id: string, status: SyncStatus): Promise<void> {
    await this.query(
      `UPDATE repositories SET sync_status = ?, updated_at = ? WHERE id = ?`,
      [status, new Date().toISOString(), id],
    );
  }
}
