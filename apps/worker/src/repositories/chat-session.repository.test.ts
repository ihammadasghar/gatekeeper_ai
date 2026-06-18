import type { ChatSession } from '@gatekeeper/types';
import { describe, expect, it, vi } from 'vitest';
import type { ID1Database, ID1PreparedStatement } from './user.repository';
import { D1ChatSessionRepository } from './chat-session.repository';

const MOCK_ROW = {
  id: 'session-uuid-1',
  repository_id: 'repo-uuid-1',
  user_id: 'user-uuid-1',
  title: 'My session',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const EXPECTED_SESSION: ChatSession = {
  id: 'session-uuid-1',
  repositoryId: 'repo-uuid-1',
  userId: 'user-uuid-1',
  title: 'My session',
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

describe('D1ChatSessionRepository.findById', () => {
  it('returns a mapped ChatSession when a row is found', async () => {
    const stmt = makeStmt(MOCK_ROW);
    const db = makeDb(stmt);
    const repo = new D1ChatSessionRepository(db);

    const result = await repo.findById('session-uuid-1');

    expect(result).toEqual(EXPECTED_SESSION);
    expect(db.prepare).toHaveBeenCalledWith(
      'SELECT * FROM chat_sessions WHERE id = ? LIMIT 1',
    );
    expect(stmt.bind).toHaveBeenCalledWith('session-uuid-1');
  });

  it('returns null when no row is found', async () => {
    const stmt = makeStmt(null);
    const db = makeDb(stmt);
    const repo = new D1ChatSessionRepository(db);

    expect(await repo.findById('nonexistent')).toBeNull();
  });
});

describe('D1ChatSessionRepository.create', () => {
  it('inserts a row with correct parameterized SQL and returns the created session', async () => {
    const stmt = makeStmt(MOCK_ROW);
    const db = makeDb(stmt);
    const repo = new D1ChatSessionRepository(db);

    const result = await repo.create({
      repositoryId: 'repo-uuid-1',
      userId: 'user-uuid-1',
      title: 'My session',
    });

    expect(result).toEqual(EXPECTED_SESSION);
    expect(db.prepare).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO chat_sessions'),
    );
    expect(stmt.bind).toHaveBeenCalledWith(
      'repo-uuid-1',
      'user-uuid-1',
      'My session',
      expect.any(String),
      expect.any(String),
    );
    expect(stmt.run).toHaveBeenCalled();
  });
});

describe('D1ChatSessionRepository.updateTitle', () => {
  it('executes a dedicated UPDATE statement for title', async () => {
    const stmt = makeStmt(null);
    const db = makeDb(stmt);
    const repo = new D1ChatSessionRepository(db);

    await repo.updateTitle('session-uuid-1', 'New Title');

    expect(db.prepare).toHaveBeenCalledWith(
      'UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?',
    );
    expect(stmt.bind).toHaveBeenCalledWith('New Title', expect.any(String), 'session-uuid-1');
    expect(stmt.run).toHaveBeenCalled();
  });
});
