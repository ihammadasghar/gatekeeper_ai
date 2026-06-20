import type { CreateUserDTO, IUserRepository, User } from '@gatekeeper/types';

export interface ID1PreparedStatement {
  bind(...values: unknown[]): ID1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ readonly results: readonly T[] }>;
  run(): Promise<unknown>;
}

export interface ID1Database {
  prepare(query: string): ID1PreparedStatement;
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

export class D1UserRepository implements IUserRepository {
  constructor(private readonly db: ID1Database) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.db
      .prepare('SELECT * FROM users WHERE id = ? LIMIT 1')
      .bind(id)
      .first<UserRow>();

    return row ? this.mapRow(row) : null;
  }

  async findByGitHubId(githubId: string): Promise<User | null> {
    const row = await this.db
      .prepare('SELECT * FROM users WHERE github_id = ? LIMIT 1')
      .bind(githubId)
      .first<UserRow>();

    return row ? this.mapRow(row) : null;
  }

  async upsert(dto: CreateUserDTO): Promise<User> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO users (id, github_id, login, name, email, avatar_url, access_token, created_at, updated_at)
         VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (github_id) DO UPDATE SET
           login = excluded.login,
           name = excluded.name,
           email = excluded.email,
           avatar_url = excluded.avatar_url,
           access_token = excluded.access_token,
           updated_at = excluded.updated_at`,
      )
      .bind(dto.githubId, dto.login, dto.name, dto.email, dto.avatarUrl, dto.accessToken, now, now)
      .run();

    const user = await this.findByGitHubId(dto.githubId);
    if (!user) {
      throw new Error('Failed to upsert user');
    }
    return user;
  }

  private mapRow(row: UserRow): User {
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
}
