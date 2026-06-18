import type { CreateUserDTO, IUserRepository, User } from '@gatekeeper/types';

interface D1QueryResult<T> {
  readonly results: T[];
}

interface D1Response<T> {
  readonly result: ReadonlyArray<D1QueryResult<T>>;
  readonly success: boolean;
  readonly errors: ReadonlyArray<{ readonly message: string }>;
}

export interface D1Config {
  readonly accountId: string;
  readonly apiToken: string;
  readonly databaseId: string;
}

interface UserRow {
  readonly id: string;
  readonly github_id: string;
  readonly login: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly avatar_url: string;
  readonly access_token: string;
  readonly created_at: string;
  readonly updated_at: string;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    githubId: row.github_id,
    login: row.login,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url,
    accessToken: row.access_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class D1UserRepository implements IUserRepository {
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

  async findByGitHubId(githubId: string): Promise<User | null> {
    const rows = await this.query<UserRow>(
      'SELECT * FROM users WHERE github_id = ? LIMIT 1',
      [githubId],
    );
    const row = rows[0];
    return row ? rowToUser(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const rows = await this.query<UserRow>('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    const row = rows[0];
    return row ? rowToUser(row) : null;
  }

  async upsert(dto: CreateUserDTO): Promise<User> {
    const now = new Date().toISOString();
    await this.query(
      `INSERT INTO users (id, github_id, login, name, email, avatar_url, access_token, created_at, updated_at)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (github_id) DO UPDATE SET
         login = excluded.login,
         name = excluded.name,
         email = excluded.email,
         avatar_url = excluded.avatar_url,
         access_token = excluded.access_token,
         updated_at = excluded.updated_at`,
      [dto.githubId, dto.login, dto.name, dto.email, dto.avatarUrl, dto.accessToken, now, now],
    );

    const user = await this.findByGitHubId(dto.githubId);
    if (!user) {
      throw new Error('Failed to upsert user');
    }
    return user;
  }
}
