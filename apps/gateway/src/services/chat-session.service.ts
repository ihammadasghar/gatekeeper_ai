import type { ChatSession, CreateChatSessionDTO, IChatSessionService } from '@gatekeeper/types';
import type { D1Config } from '../repositories/user.repository.js';

interface D1QueryResult<T> {
  readonly results: T[];
}

interface D1Response<T> {
  readonly result: ReadonlyArray<D1QueryResult<T>>;
  readonly success: boolean;
  readonly errors: ReadonlyArray<{ readonly message: string }>;
}

interface ChatSessionRow {
  readonly id: string;
  readonly repository_id: string;
  readonly user_id: string;
  readonly title: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

function rowToChatSession(row: ChatSessionRow): ChatSession {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    userId: row.user_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class D1ChatSessionService implements IChatSessionService {
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

  async findByRepository(repoId: string): Promise<ChatSession[]> {
    const rows = await this.query<ChatSessionRow>(
      'SELECT * FROM chat_sessions WHERE repository_id = ? ORDER BY created_at DESC',
      [repoId],
    );
    return rows.map(rowToChatSession);
  }

  async create(dto: CreateChatSessionDTO): Promise<ChatSession> {
    const now = new Date().toISOString();
    await this.query(
      `INSERT INTO chat_sessions (id, repository_id, user_id, title, created_at, updated_at)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?)`,
      [dto.repositoryId, dto.userId, dto.title, now, now],
    );

    const rows = await this.query<ChatSessionRow>(
      'SELECT * FROM chat_sessions WHERE repository_id = ? AND user_id = ? ORDER BY rowid DESC LIMIT 1',
      [dto.repositoryId, dto.userId],
    );
    const row = rows[0];
    if (!row) throw new Error('Failed to create chat session');
    return rowToChatSession(row);
  }
}
