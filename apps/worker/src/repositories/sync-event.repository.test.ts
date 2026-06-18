import type { SyncEvent } from '@gatekeeper/types';
import { describe, expect, it, vi } from 'vitest';
import type { ID1Database, ID1PreparedStatement } from './user.repository';
import { D1SyncEventRepository } from './sync-event.repository';

const MOCK_ROW = {
  id: 'evt-uuid-1',
  type: 'DELTA_SYNC',
  status: 'pending',
  payload: '{"ref":"refs/heads/main"}',
  repository_id: 'repo-uuid-1',
  created_at: '2024-01-01T00:00:00.000Z',
};

const EXPECTED_EVENT: SyncEvent = {
  id: 'evt-uuid-1',
  type: 'DELTA_SYNC',
  status: 'pending',
  payload: '{"ref":"refs/heads/main"}',
  repositoryId: 'repo-uuid-1',
  createdAt: '2024-01-01T00:00:00.000Z',
};

function makeStmt(firstResult: unknown, allResults: unknown[] = []): ID1PreparedStatement {
  return {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(firstResult),
    all: vi.fn().mockResolvedValue({ results: allResults }),
    run: vi.fn().mockResolvedValue(undefined),
  };
}

function makeDb(stmt: ID1PreparedStatement): ID1Database {
  return { prepare: vi.fn().mockReturnValue(stmt) };
}

describe('D1SyncEventRepository.create', () => {
  it('inserts a row and returns the created SyncEvent', async () => {
    const stmt = makeStmt(MOCK_ROW);
    const db = makeDb(stmt);
    const repo = new D1SyncEventRepository(db);

    const result = await repo.create({
      type: 'DELTA_SYNC',
      repositoryId: 'repo-uuid-1',
      payload: { ref: 'refs/heads/main' },
    });

    expect(result).toEqual(EXPECTED_EVENT);
    expect(db.prepare).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO sync_events'),
    );
    expect(stmt.bind).toHaveBeenCalledWith(
      'DELTA_SYNC',
      JSON.stringify({ ref: 'refs/heads/main' }),
      'repo-uuid-1',
      expect.any(String),
    );
    expect(stmt.run).toHaveBeenCalled();
  });
});

describe('D1SyncEventRepository.updateStatus', () => {
  it('executes a dedicated UPDATE statement with the new status', async () => {
    const stmt = makeStmt(null);
    const db = makeDb(stmt);
    const repo = new D1SyncEventRepository(db);

    await repo.updateStatus('evt-uuid-1', 'running');

    expect(db.prepare).toHaveBeenCalledWith(
      'UPDATE sync_events SET status = ? WHERE id = ?',
    );
    expect(stmt.bind).toHaveBeenCalledWith('running', 'evt-uuid-1');
    expect(stmt.run).toHaveBeenCalled();
  });

  it('accepts all valid SyncEventStatus values', async () => {
    const db = makeDb(makeStmt(null));
    const repo = new D1SyncEventRepository(db);

    await expect(repo.updateStatus('id', 'pending')).resolves.toBeUndefined();
    await expect(repo.updateStatus('id', 'running')).resolves.toBeUndefined();
    await expect(repo.updateStatus('id', 'completed')).resolves.toBeUndefined();
    await expect(repo.updateStatus('id', 'failed')).resolves.toBeUndefined();
  });
});

describe('D1SyncEventRepository.findByRepository', () => {
  it('returns all sync events for a repository', async () => {
    const stmt = makeStmt(null, [MOCK_ROW]);
    const db = makeDb(stmt);
    const repo = new D1SyncEventRepository(db);

    const results = await repo.findByRepository('repo-uuid-1');

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(EXPECTED_EVENT);
    expect(db.prepare).toHaveBeenCalledWith(
      expect.stringContaining('WHERE repository_id = ?'),
    );
    expect(stmt.bind).toHaveBeenCalledWith('repo-uuid-1');
  });

  it('returns an empty array when no events exist', async () => {
    const stmt = makeStmt(null, []);
    const db = makeDb(stmt);
    const repo = new D1SyncEventRepository(db);

    expect(await repo.findByRepository('repo-uuid-1')).toEqual([]);
  });
});
