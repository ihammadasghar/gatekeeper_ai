export interface User {
  readonly id: string;
  readonly githubId: string;
  readonly login: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly avatarUrl: string;
  readonly accessToken: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateUserDTO {
  readonly githubId: string;
  readonly login: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly avatarUrl: string;
  readonly accessToken: string;
}

export interface IUserRepository {
  findByGitHubId(githubId: string): Promise<User | null>;
  upsert(user: CreateUserDTO): Promise<User>;
  findById(id: string): Promise<User | null>;
}
