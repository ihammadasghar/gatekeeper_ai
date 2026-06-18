import type { User } from '@gatekeeper/types';
import { describe, expect, it, vi } from 'vitest';
import type { ID1Database, ID1PreparedStatement } from './user.repository';
import { D1UserRepository } from './user.repository';

const MOCK_USER_ROW = {
  id: 'user-uuid-1',
  github_id: '42',
  login: 'octocat',
  name: 'The Octocat',
  email: 'octocat@github.com',
  avatar_url: 'https://github.com/images/error/octocat_happy.gif',
  access_token: 'gho_secret',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const EXPECTED_USER: User = {
  id: 'user-uuid-1',
  githubId: '42',
  login: 'octocat',
  name: 'The Octocat',
  email: 'octocat@github.com',
  avatarUrl: 'https://github.com/images/error/octocat_happy.gif',
  accessToken: 'gho_secret',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

function makeStmt(result: unknown): ID1PreparedStatement {
  const stmt: ID1PreparedStatement = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(result),
    all: vi.fn().mockResolvedValue({ results: [] }),
    run: vi.fn().mockResolvedValue(undefined),
  };
  return stmt;
}

function makeDb(stmt: ID1PreparedStatement): ID1Database {
  return { prepare: vi.fn().mockReturnValue(stmt) };
}

describe('D1UserRepository.findById', () => {
  it('returns a mapped User when a row is found', async () => {
    const stmt = makeStmt(MOCK_USER_ROW);
    const db = makeDb(stmt);
    const repo = new D1UserRepository(db);

    const result = await repo.findById('user-uuid-1');

    expect(result).toEqual(EXPECTED_USER);
    expect(db.prepare).toHaveBeenCalledWith('SELECT * FROM users WHERE id = ? LIMIT 1');
    expect(stmt.bind).toHaveBeenCalledWith('user-uuid-1');
  });

  it('returns null when no row is found', async () => {
    const stmt = makeStmt(null);
    const db = makeDb(stmt);
    const repo = new D1UserRepository(db);

    const result = await repo.findById('nonexistent-id');

    expect(result).toBeNull();
  });
});

describe('D1UserRepository.findByGitHubId', () => {
  it('returns a mapped User when a row is found', async () => {
    const stmt = makeStmt(MOCK_USER_ROW);
    const db = makeDb(stmt);
    const repo = new D1UserRepository(db);

    const result = await repo.findByGitHubId('42');

    expect(result).toEqual(EXPECTED_USER);
    expect(db.prepare).toHaveBeenCalledWith(
      'SELECT * FROM users WHERE github_id = ? LIMIT 1',
    );
    expect(stmt.bind).toHaveBeenCalledWith('42');
  });

  it('returns null when no row is found', async () => {
    const stmt = makeStmt(null);
    const db = makeDb(stmt);
    const repo = new D1UserRepository(db);

    const result = await repo.findByGitHubId('nonexistent-github-id');

    expect(result).toBeNull();
  });
});
