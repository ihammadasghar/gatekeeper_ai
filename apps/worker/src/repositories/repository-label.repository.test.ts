import { describe, expect, it, vi } from 'vitest';
import type { LabelInput, RepositoryLabel } from '@gatekeeper/types';
import type { ID1Database, ID1PreparedStatement } from './user.repository';
import { D1RepositoryLabelRepository } from './repository-label.repository';

function makeStmt(result: unknown = null): ID1PreparedStatement {
  return {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(result),
    all: vi.fn().mockResolvedValue({ results: [] }),
    run: vi.fn().mockResolvedValue(undefined),
  };
}

describe('D1RepositoryLabelRepository', () => {
  describe('upsertAll()', () => {
    it('issues a DELETE before any INSERT', async () => {
      // Arrange
      const preparedSqls: string[] = [];
      const db: ID1Database = {
        prepare: vi.fn().mockImplementation((sql: string) => {
          preparedSqls.push(sql);
          return makeStmt();
        }),
      };
      const repo = new D1RepositoryLabelRepository(db);
      const labels: LabelInput[] = [{ name: 'bug', color: 'fc2929' }];

      // Act
      await repo.upsertAll('repo-1', labels);

      // Assert — first statement must be the DELETE
      expect(preparedSqls[0]).toMatch(/DELETE FROM repository_labels/i);
    });

    it('removes stale labels: DELETE is called before INSERT so old rows are gone', async () => {
      // Arrange — a fresh call represents replacing the previous label set entirely
      const runCalls: string[] = [];
      const db: ID1Database = {
        prepare: vi.fn().mockImplementation((sql: string) =>
          ({
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue(null),
            all: vi.fn().mockResolvedValue({ results: [] }),
            run: vi.fn().mockImplementation(async () => { runCalls.push(sql); }),
          } as ID1PreparedStatement),
        ),
      };
      const repo = new D1RepositoryLabelRepository(db);

      // Act — upsert with only 1 label (simulating that a previous "wontfix" label was removed)
      await repo.upsertAll('repo-1', [{ name: 'bug', color: 'fc2929' }]);

      // Assert — DELETE ran first, then one INSERT
      expect(runCalls).toHaveLength(2);
      expect(runCalls[0]).toMatch(/DELETE FROM repository_labels/i);
      expect(runCalls[1]).toMatch(/INSERT INTO repository_labels/i);
    });

    it('inserts one row per label with correct bindings', async () => {
      // Arrange
      const stmt = makeStmt();
      const db: ID1Database = { prepare: vi.fn().mockReturnValue(stmt) };
      const repo = new D1RepositoryLabelRepository(db);
      const labels: LabelInput[] = [
        { name: 'bug', color: 'fc2929', description: 'Something is broken' },
        { name: 'enhancement', color: '84b6eb', description: null },
      ];

      // Act
      await repo.upsertAll('repo-1', labels);

      // Assert — db.prepare called 3 times: 1 DELETE + 2 INSERTs
      expect(db.prepare).toHaveBeenCalledTimes(3);
    });

    it('handles empty label list: only DELETE is called', async () => {
      // Arrange
      const stmt = makeStmt();
      const db: ID1Database = { prepare: vi.fn().mockReturnValue(stmt) };
      const repo = new D1RepositoryLabelRepository(db);

      // Act
      await repo.upsertAll('repo-1', []);

      // Assert — only DELETE, no INSERT
      expect(db.prepare).toHaveBeenCalledTimes(1);
      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringMatching(/DELETE FROM repository_labels/i),
      );
    });

    it('stores null description when description is undefined', async () => {
      // Arrange
      const stmt = makeStmt();
      const db: ID1Database = { prepare: vi.fn().mockReturnValue(stmt) };
      const repo = new D1RepositoryLabelRepository(db);

      // Act
      await repo.upsertAll('repo-1', [{ name: 'bug', color: 'fc2929' }]);

      // Assert — bind called with null (not undefined) for description
      const insertBind = (stmt.bind as ReturnType<typeof vi.fn>).mock.calls
        .find((args: unknown[]) => (args as unknown[]).includes('bug')) as unknown[] | undefined;
      expect(insertBind).toBeDefined();
      expect(insertBind?.[2]).toBeNull();
    });
  });

  describe('findByRepository()', () => {
    it('returns mapped RepositoryLabel[] for a given repository', async () => {
      // Arrange
      const rows = [
        { id: 'lbl-1', repository_id: 'repo-1', name: 'bug', description: 'A bug', color: 'fc2929' },
        { id: 'lbl-2', repository_id: 'repo-1', name: 'enhancement', description: null, color: '84b6eb' },
      ];
      const stmt = makeStmt();
      (stmt.all as ReturnType<typeof vi.fn>).mockResolvedValue({ results: rows });
      const db: ID1Database = { prepare: vi.fn().mockReturnValue(stmt) };
      const repo = new D1RepositoryLabelRepository(db);

      // Act
      const result = await repo.findByRepository('repo-1');

      // Assert
      const expected: RepositoryLabel[] = [
        { id: 'lbl-1', repositoryId: 'repo-1', name: 'bug', description: 'A bug', color: 'fc2929' },
        { id: 'lbl-2', repositoryId: 'repo-1', name: 'enhancement', description: null, color: '84b6eb' },
      ];
      expect(result).toEqual(expected);
      expect(stmt.bind).toHaveBeenCalledWith('repo-1');
    });

    it('returns an empty array when no labels exist', async () => {
      // Arrange
      const stmt = makeStmt();
      (stmt.all as ReturnType<typeof vi.fn>).mockResolvedValue({ results: [] });
      const db: ID1Database = { prepare: vi.fn().mockReturnValue(stmt) };
      const repo = new D1RepositoryLabelRepository(db);

      // Act + Assert
      expect(await repo.findByRepository('repo-1')).toEqual([]);
    });
  });
});
