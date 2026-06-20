import type {
  ChunkMetadata,
  IChunker,
  ISyncEventRepository,
  IVectorizeService,
  VectorDocument,
} from '@gatekeeper/types';

// How many chunk IDs to generate per file for deterministic deletion.
// Vectorize silently skips non-existent IDs, so this acts as an upper bound.
const MAX_FILE_CHUNKS = 200;

const MARKDOWN_EXTENSIONS = new Set(['.md', '.mdx']);
const TEMPLATE_PATH_PREFIX = '.github/issue_template/';

export interface DeltaSyncPayload {
  readonly repositoryId: string;
  readonly owner: string;
  readonly repo: string;
  readonly commitSha: string;
  readonly installationId: string;
}

export type CommitFileStatus = 'added' | 'modified' | 'removed' | 'renamed';

export interface CommitFile {
  readonly filename: string;
  readonly status: CommitFileStatus;
  readonly previous_filename?: string;
}

export interface IGitHubFileService {
  getCommitFiles(owner: string, repo: string, sha: string): Promise<CommitFile[]>;
  getFileContent(
    owner: string,
    repo: string,
    filePath: string,
    ref: string,
  ): Promise<string | null>;
}

// Minimal interface matching WorkflowStep so the runner can be tested without CF runtime.
export interface IWorkflowStep {
  do<T>(name: string, fn: () => Promise<T>): Promise<T>;
}

export class DeltaSyncRunner {
  constructor(
    private readonly vectorize: IVectorizeService,
    private readonly syncEventRepo: ISyncEventRepository,
    private readonly github: IGitHubFileService,
    private readonly markdownChunker: IChunker,
  ) {}

  async run(step: IWorkflowStep, payload: DeltaSyncPayload, syncEventId: string): Promise<void> {
    // Step 1: fetch changed file list from GitHub
    const changedFiles = await step.do('fetch-diff', () =>
      this.github.getCommitFiles(payload.owner, payload.repo, payload.commitSha),
    );

    // Step 2: delete old vectors for removed, modified, and renamed (old path) files
    await step.do('delete-old-vectors', async () => {
      const filesToDelete = changedFiles.flatMap((f) => {
        const paths: string[] = [];
        if (f.status === 'removed' || f.status === 'modified') {
          paths.push(f.filename);
        }
        if (f.status === 'renamed' && f.previous_filename) {
          paths.push(f.previous_filename);
        }
        return paths;
      });

      const idsToDelete = filesToDelete.flatMap((filePath) =>
        buildFileVectorIds(payload.repositoryId, filePath, MAX_FILE_CHUNKS),
      );

      if (idsToDelete.length > 0) {
        await this.vectorize.delete(idsToDelete);
      }
    });

    // Step 3: fetch content and chunk added, modified, and renamed (new path) files
    const newDocs = await step.do('fetch-and-chunk-changed', async () => {
      const filesToChunk = changedFiles.filter(
        (f) => f.status === 'added' || f.status === 'modified' || f.status === 'renamed',
      );

      const allDocs: VectorDocument[] = [];

      for (const file of filesToChunk) {
        const chunkType = resolveChunkType(file.filename);
        if (chunkType === null) continue; // skip unsupported file types (e.g. code files — ARCH-014)

        const content = await this.github.getFileContent(
          payload.owner,
          payload.repo,
          file.filename,
          payload.commitSha,
        );
        if (content === null) continue;

        const metadata: ChunkMetadata = {
          repository_id: payload.repositoryId,
          type: chunkType,
          file_path: file.filename,
        };

        const docs = await this.markdownChunker.chunk(content, metadata);
        allDocs.push(...docs);
      }

      return allDocs;
    });

    // Step 4: upsert the new chunks
    await step.do('upsert-new-vectors', async () => {
      if (newDocs.length > 0) {
        await this.vectorize.upsert(newDocs);
      }
    });

    // Step 5: mark sync event as completed
    await step.do('update-sync-event', () =>
      this.syncEventRepo.updateStatus(syncEventId, 'completed'),
    );
  }
}

export function buildFileVectorIds(
  repositoryId: string,
  filePath: string,
  maxChunks: number,
): string[] {
  const prefix = `${encodeURIComponent(repositoryId)}:${encodeURIComponent(filePath)}`;
  return Array.from({ length: maxChunks }, (_, i) => `${prefix}:${i}`);
}

export function resolveChunkType(filePath: string): 'doc' | 'template' | null {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1) return null;

  const ext = filePath.slice(lastDot).toLowerCase();
  if (!MARKDOWN_EXTENSIONS.has(ext)) return null;

  if (filePath.toLowerCase().startsWith(TEMPLATE_PATH_PREFIX)) return 'template';
  return 'doc';
}
