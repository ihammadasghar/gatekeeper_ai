import type { IRepositoryRepository, Repository, SyncStatus } from '@gatekeeper/types';
import type { ID1Database } from './user.repository.js';

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

export class D1RepositoryRepository implements IRepositoryRepository {
  constructor(private readonly db: ID1Database) {}

  async findById(id: string): Promise<Repository | null> {
    const row = await this.db
      .prepare('SELECT * FROM repositories WHERE id = ? LIMIT 1')
      .bind(id)
      .first<RepositoryRow>();

    return row ? this.mapRow(row) : null;
  }

  async findByGitHubRepoId(githubRepoId: string): Promise<Repository | null> {
    const row = await this.db
      .prepare('SELECT * FROM repositories WHERE github_repo_id = ? LIMIT 1')
      .bind(githubRepoId)
      .first<RepositoryRow>();

    return row ? this.mapRow(row) : null;
  }

  async updateSyncStatus(id: string, status: SyncStatus): Promise<void> {
    await this.db
      .prepare('UPDATE repositories SET sync_status = ?, updated_at = ? WHERE id = ?')
      .bind(status, new Date().toISOString(), id)
      .run();
  }

  private mapRow(row: RepositoryRow): Repository {
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
}
