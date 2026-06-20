import type { IRepositoryLabelRepository, LabelInput, RepositoryLabel } from '@gatekeeper/types';
import type { ID1Database } from './user.repository.js';

interface LabelRow {
  readonly id: string;
  readonly repository_id: string;
  readonly name: string;
  readonly description: string | null;
  readonly color: string;
}

export class D1RepositoryLabelRepository implements IRepositoryLabelRepository {
  constructor(private readonly db: ID1Database) {}

  async upsertAll(repositoryId: string, labels: readonly LabelInput[]): Promise<void> {
    // Delete the full existing set first — any labels absent from the new list are removed.
    await this.db
      .prepare('DELETE FROM repository_labels WHERE repository_id = ?')
      .bind(repositoryId)
      .run();

    await Promise.all(
      labels.map((label) =>
        this.db
          .prepare(
            `INSERT INTO repository_labels (id, repository_id, name, description, color)
             VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?)`,
          )
          .bind(repositoryId, label.name, label.description ?? null, label.color)
          .run(),
      ),
    );
  }

  async findByRepository(repositoryId: string): Promise<RepositoryLabel[]> {
    const result = await this.db
      .prepare('SELECT * FROM repository_labels WHERE repository_id = ? ORDER BY name ASC')
      .bind(repositoryId)
      .all<LabelRow>();

    return result.results.map((row) => this.mapRow(row));
  }

  private mapRow(row: LabelRow): RepositoryLabel {
    return {
      id: row.id,
      repositoryId: row.repository_id,
      name: row.name,
      description: row.description,
      color: row.color,
    };
  }
}
