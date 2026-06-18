export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface Repository {
  readonly id: string;
  readonly userId: string;
  readonly githubRepoId: string;
  readonly owner: string;
  readonly name: string;
  readonly installationId: string;
  readonly syncStatus: SyncStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateRepositoryDTO {
  readonly userId: string;
  readonly githubRepoId: string;
  readonly owner: string;
  readonly name: string;
  readonly installationId: string;
}

export interface IRepositoryService {
  findByUser(userId: string): Promise<Repository[]>;
  create(dto: CreateRepositoryDTO): Promise<Repository>;
  findById(id: string): Promise<Repository | null>;
  updateSyncStatus(id: string, status: SyncStatus): Promise<void>;
}

export interface ChatSession {
  readonly id: string;
  readonly repositoryId: string;
  readonly userId: string;
  readonly title: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateChatSessionDTO {
  readonly repositoryId: string;
  readonly userId: string;
  readonly title: string | null;
}

export interface IRepositoryRepository {
  findById(id: string): Promise<Repository | null>;
  updateSyncStatus(id: string, status: SyncStatus): Promise<void>;
  findByGitHubRepoId(githubRepoId: string): Promise<Repository | null>;
}

export interface IChatSessionRepository {
  findById(id: string): Promise<ChatSession | null>;
  create(dto: CreateChatSessionDTO): Promise<ChatSession>;
  updateTitle(id: string, title: string): Promise<void>;
}

export interface IChatSessionService {
  findByRepository(repoId: string): Promise<ChatSession[]>;
  create(dto: CreateChatSessionDTO): Promise<ChatSession>;
}
