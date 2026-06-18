import type { Repository } from '@gatekeeper/types';
import { describe, expect, it, vi } from 'vitest';
import type { ID1Database, ID1PreparedStatement } from './user.repository';
import { D1RepositoryRepository } from './repository.repository';

const MOCK_REPO_ROW = {
  id: 'repo-uuid-1',
  user_id: 'user-uuid-1',
  github_repo_id: '12345',
  owner: 'octocat',
  name: 'hello-world',
  installation_id: 'install-1',
  sync_status: 'pending',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const EXPECTED_REPO: Repository = {
  id: 'repo-uuid-1',
  userId: 'user-uuid-1',
  githubRepoId: '12345',
  owner: 'octocat',
  name: 'hello-world',
  installationId: 'install-1',
  syncStatus: 'pending',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

function makeStmt(result: unknown): ID1PreparedStatement {
  return {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(result),
    all: vi.fn().mockResolvedValue({ results: [] }),
    run: vi.fn().mockResolvedValue(undefined),
  };
}

function makeDb(stmt: ID1PreparedStatement): ID1Database {
  return { prepare: vi.fn().mockReturnValue(stmt) };
}

describe('D1RepositoryRepository.findById', () => {
  it('returns a mapped Repository when a row is found', async () => {
    const stmt = makeStmt(MOCK_REPO_ROW);
    const db = makeDb(stmt);
    const repo = new D1RepositoryRepository(db);

    const result = await repo.findById('repo-uuid-1');

    expect(result).toEqual(EXPECTED_REPO);
    expect(db.prepare).toHaveBeenCalledWith(
      'SELECT * FROM repositories WHERE id = ? LIMIT 1',
    );
    expect(stmt.bind).toHaveBeenCalledWith('repo-uuid-1');
  });

  it('returns null when no row is found', async () => {
    const stmt = makeStmt(null);
    const db = makeDb(stmt);
    const repo = new D1RepositoryRepository(db);

    expect(await repo.findById('nonexistent')).toBeNull();
  });
});

describe('D1RepositoryRepository.findByGitHubRepoId', () => {
  it('returns a mapped Repository when a row is found', async () => {
    const stmt = makeStmt(MOCK_REPO_ROW);
    const db = makeDb(stmt);
    const repo = new D1RepositoryRepository(db);

    const result = await repo.findByGitHubRepoId('12345');

    expect(result).toEqual(EXPECTED_REPO);
    expect(db.prepare).toHaveBeenCalledWith(
      'SELECT * FROM repositories WHERE github_repo_id = ? LIMIT 1',
    );
    expect(stmt.bind).toHaveBeenCalledWith('12345');
  });

  it('returns null when no row is found', async () => {
    const stmt = makeStmt(null);
    const db = makeDb(stmt);
    const repo = new D1RepositoryRepository(db);

    expect(await repo.findByGitHubRepoId('nonexistent')).toBeNull();
  });
});

describe('D1RepositoryRepository.updateSyncStatus', () => {
  it('executes a dedicated UPDATE statement with status and id', async () => {
    const stmt = makeStmt(null);
    const db = makeDb(stmt);
    const repo = new D1RepositoryRepository(db);

    await repo.updateSyncStatus('repo-uuid-1', 'synced');

    expect(db.prepare).toHaveBeenCalledWith(
      'UPDATE repositories SET sync_status = ?, updated_at = ? WHERE id = ?',
    );
    expect(stmt.bind).toHaveBeenCalledWith('synced', expect.any(String), 'repo-uuid-1');
    expect(stmt.run).toHaveBeenCalled();
  });
});
