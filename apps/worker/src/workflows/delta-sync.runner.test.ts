import { describe, expect, it, vi } from 'vitest';
import {
  DeltaSyncRunner,
  buildFileVectorIds,
  resolveChunkType,
  type CommitFile,
  type DeltaSyncPayload,
  type IGitHubFileService,
  type IWorkflowStep,
} from './delta-sync.runner';
import type { IChunker, ISyncEventRepository, IVectorizeService, VectorDocument } from '@gatekeeper/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

const BASE_PAYLOAD: DeltaSyncPayload = {
  repositoryId: 'repo-uuid-1',
  owner: 'acme',
  repo: 'backend',
  commitSha: 'abc123',
  installationId: 'inst-1',
};

const SYNC_EVENT_ID = 'event-uuid-1';

/** A step that simply executes each fn in sequence (no CF checkpointing). */
const makeStep = (): IWorkflowStep => ({
  do: async <T>(_name: string, fn: () => Promise<T>) => fn(),
});

const makeVectorize = (): IVectorizeService => ({
  upsert: vi.fn().mockResolvedValue(undefined),
  search: vi.fn().mockResolvedValue([]),
  delete: vi.fn().mockResolvedValue(undefined),
});

const makeSyncEventRepo = (): ISyncEventRepository => ({
  create: vi.fn(),
  updateStatus: vi.fn().mockResolvedValue(undefined),
  findByRepository: vi.fn(),
});

const makeMarkdownChunker = (docs: VectorDocument[] = []): IChunker => ({
  chunk: vi.fn().mockResolvedValue(docs),
});

const makeGitHub = (
  files: CommitFile[] = [],
  content: string | null = '## Section\nBody text.',
): IGitHubFileService => ({
  getCommitFiles: vi.fn().mockResolvedValue(files),
  getFileContent: vi.fn().mockResolvedValue(content),
});

const makeDoc = (filePath: string): VectorDocument => ({
  text: `Content of ${filePath}`,
  metadata: { repository_id: 'repo-uuid-1', type: 'doc', file_path: filePath },
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DeltaSyncRunner', () => {
  describe('run()', () => {
    it('calls delete for removed files and does NOT upsert them', async () => {
      // Arrange
      const files: CommitFile[] = [{ filename: 'docs/old.md', status: 'removed' }];
      const vectorize = makeVectorize();
      const runner = new DeltaSyncRunner(
        vectorize, makeSyncEventRepo(), makeGitHub(files), makeMarkdownChunker(),
      );

      // Act
      await runner.run(makeStep(), BASE_PAYLOAD, SYNC_EVENT_ID);

      // Assert
      expect(vectorize.delete).toHaveBeenCalledOnce();
      expect(vectorize.upsert).not.toHaveBeenCalled();
    });

    it('deletes modified files BEFORE upserting new chunks', async () => {
      // Arrange
      const callOrder: string[] = [];
      const files: CommitFile[] = [{ filename: 'docs/guide.md', status: 'modified' }];
      const doc = makeDoc('docs/guide.md');

      const vectorize: IVectorizeService = {
        delete: vi.fn().mockImplementation(async () => { callOrder.push('delete'); }),
        upsert: vi.fn().mockImplementation(async () => { callOrder.push('upsert'); }),
        search: vi.fn().mockResolvedValue([]),
      };
      const runner = new DeltaSyncRunner(
        vectorize, makeSyncEventRepo(), makeGitHub(files), makeMarkdownChunker([doc]),
      );

      // Act
      await runner.run(makeStep(), BASE_PAYLOAD, SYNC_EVENT_ID);

      // Assert
      expect(callOrder).toEqual(['delete', 'upsert']);
      expect(callOrder.indexOf('delete')).toBeLessThan(callOrder.indexOf('upsert'));
    });

    it('only calls upsert (not delete) for added files', async () => {
      // Arrange
      const files: CommitFile[] = [{ filename: 'docs/new.md', status: 'added' }];
      const doc = makeDoc('docs/new.md');
      const vectorize = makeVectorize();
      const runner = new DeltaSyncRunner(
        vectorize, makeSyncEventRepo(), makeGitHub(files), makeMarkdownChunker([doc]),
      );

      // Act
      await runner.run(makeStep(), BASE_PAYLOAD, SYNC_EVENT_ID);

      // Assert
      expect(vectorize.delete).not.toHaveBeenCalled();
      expect(vectorize.upsert).toHaveBeenCalledOnce();
      const [upsertedDocs] = (vectorize.upsert as ReturnType<typeof vi.fn>).mock.calls[0] as [VectorDocument[]];
      expect(upsertedDocs[0]?.metadata.file_path).toBe('docs/new.md');
    });

    it('deletes old path and upserts new path for renamed files', async () => {
      // Arrange
      const files: CommitFile[] = [{
        filename: 'docs/new-name.md',
        status: 'renamed',
        previous_filename: 'docs/old-name.md',
      }];
      const doc = makeDoc('docs/new-name.md');
      const vectorize = makeVectorize();
      const runner = new DeltaSyncRunner(
        vectorize, makeSyncEventRepo(), makeGitHub(files), makeMarkdownChunker([doc]),
      );

      // Act
      await runner.run(makeStep(), BASE_PAYLOAD, SYNC_EVENT_ID);

      // Assert — delete uses old path
      const [deletedIds] = (vectorize.delete as ReturnType<typeof vi.fn>).mock.calls[0] as [string[]];
      expect(deletedIds.some((id) => id.includes(encodeURIComponent('docs/old-name.md')))).toBe(true);
      expect(deletedIds.some((id) => id.includes(encodeURIComponent('docs/new-name.md')))).toBe(false);

      // Assert — upsert uses new path
      const [upsertedDocs] = (vectorize.upsert as ReturnType<typeof vi.fn>).mock.calls[0] as [VectorDocument[]];
      expect(upsertedDocs[0]?.metadata.file_path).toBe('docs/new-name.md');
    });

    it('skips non-markdown files for chunking and upserting', async () => {
      // Arrange
      const files: CommitFile[] = [{ filename: 'src/app.ts', status: 'added' }];
      const vectorize = makeVectorize();
      const chunker = makeMarkdownChunker();
      const runner = new DeltaSyncRunner(
        vectorize, makeSyncEventRepo(), makeGitHub(files), chunker,
      );

      // Act
      await runner.run(makeStep(), BASE_PAYLOAD, SYNC_EVENT_ID);

      // Assert — not chunked, not upserted
      expect(chunker.chunk).not.toHaveBeenCalled();
      expect(vectorize.upsert).not.toHaveBeenCalled();
    });

    it('still deletes non-markdown modified files (old vectors must be cleared)', async () => {
      // Arrange
      const files: CommitFile[] = [{ filename: 'src/app.ts', status: 'modified' }];
      const vectorize = makeVectorize();
      const runner = new DeltaSyncRunner(
        vectorize, makeSyncEventRepo(), makeGitHub(files), makeMarkdownChunker(),
      );

      // Act
      await runner.run(makeStep(), BASE_PAYLOAD, SYNC_EVENT_ID);

      // Assert — delete called (old vectors cleared), no upsert
      expect(vectorize.delete).toHaveBeenCalledOnce();
      expect(vectorize.upsert).not.toHaveBeenCalled();
    });

    it('marks the SyncEvent as completed after all steps', async () => {
      // Arrange
      const files: CommitFile[] = [{ filename: 'README.md', status: 'added' }];
      const syncEventRepo = makeSyncEventRepo();
      const runner = new DeltaSyncRunner(
        makeVectorize(), syncEventRepo, makeGitHub(files), makeMarkdownChunker([makeDoc('README.md')]),
      );

      // Act
      await runner.run(makeStep(), BASE_PAYLOAD, SYNC_EVENT_ID);

      // Assert
      expect(syncEventRepo.updateStatus).toHaveBeenCalledWith(SYNC_EVENT_ID, 'completed');
    });

    it('skips upsert when chunker produces no documents', async () => {
      // Arrange
      const files: CommitFile[] = [{ filename: 'docs/empty.md', status: 'added' }];
      const vectorize = makeVectorize();
      const runner = new DeltaSyncRunner(
        vectorize, makeSyncEventRepo(), makeGitHub(files), makeMarkdownChunker([]),
      );

      // Act
      await runner.run(makeStep(), BASE_PAYLOAD, SYNC_EVENT_ID);

      // Assert — chunker called but no upsert since 0 docs
      expect(vectorize.upsert).not.toHaveBeenCalled();
    });
  });
});

// ── Unit tests for helpers ────────────────────────────────────────────────────

describe('buildFileVectorIds()', () => {
  it('returns maxChunks IDs with correct format', () => {
    const ids = buildFileVectorIds('repo-1', 'src/main.ts', 3);
    expect(ids).toHaveLength(3);
    expect(ids[0]).toBe(`${encodeURIComponent('repo-1')}:${encodeURIComponent('src/main.ts')}:0`);
    expect(ids[2]).toBe(`${encodeURIComponent('repo-1')}:${encodeURIComponent('src/main.ts')}:2`);
  });

  it('URL-encodes repository_id and file_path', () => {
    const ids = buildFileVectorIds('my repo', 'path with spaces/file.md', 1);
    expect(ids[0]).toBe(`my%20repo:path%20with%20spaces%2Ffile.md:0`);
  });
});

describe('resolveChunkType()', () => {
  it('returns "doc" for .md files', () => {
    expect(resolveChunkType('docs/guide.md')).toBe('doc');
  });

  it('returns "template" for .github/issue_template/ paths', () => {
    expect(resolveChunkType('.github/issue_template/bug_report.md')).toBe('template');
  });

  it('returns null for .ts files', () => {
    expect(resolveChunkType('src/app.ts')).toBeNull();
  });

  it('returns null for files with no extension', () => {
    expect(resolveChunkType('Makefile')).toBeNull();
  });

  it('is case-insensitive for template path detection', () => {
    expect(resolveChunkType('.github/ISSUE_TEMPLATE/bug.md')).toBe('template');
  });
});
