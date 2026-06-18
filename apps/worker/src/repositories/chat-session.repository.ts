import type {
  ChatSession,
  CreateChatSessionDTO,
  IChatSessionRepository,
} from '@gatekeeper/types';
import type { ID1Database } from './user.repository.js';

interface ChatSessionRow {
  readonly id: string;
  readonly repository_id: string;
  readonly user_id: string;
  readonly title: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export class D1ChatSessionRepository implements IChatSessionRepository {
  constructor(private readonly db: ID1Database) {}

  async findById(id: string): Promise<ChatSession | null> {
    const row = await this.db
      .prepare('SELECT * FROM chat_sessions WHERE id = ? LIMIT 1')
      .bind(id)
      .first<ChatSessionRow>();

    return row ? this.mapRow(row) : null;
  }

  async create(dto: CreateChatSessionDTO): Promise<ChatSession> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO chat_sessions (id, repository_id, user_id, title, created_at, updated_at)
         VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?)`,
      )
      .bind(dto.repositoryId, dto.userId, dto.title, now, now)
      .run();

    const row = await this.db
      .prepare(
        'SELECT * FROM chat_sessions WHERE repository_id = ? AND user_id = ? ORDER BY rowid DESC LIMIT 1',
      )
      .bind(dto.repositoryId, dto.userId)
      .first<ChatSessionRow>();

    if (!row) throw new Error('Failed to create chat session');
    return this.mapRow(row);
  }

  async updateTitle(id: string, title: string): Promise<void> {
    await this.db
      .prepare('UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?')
      .bind(title, new Date().toISOString(), id)
      .run();
  }

  private mapRow(row: ChatSessionRow): ChatSession {
    return {
      id: row.id,
      repositoryId: row.repository_id,
      userId: row.user_id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
