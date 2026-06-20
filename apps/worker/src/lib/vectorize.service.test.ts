import { describe, expect, it, vi } from 'vitest';
import { VectorizeService } from './vectorize.service';
import type { IAIBinding, IVectorizeIndex, IVectorizeMatch, VectorDocument } from '@gatekeeper/types';

const makeEmbedding = (seed: number): number[] => Array.from({ length: 4 }, (_, i) => seed + i);

const makeAI = (embedding: number[] = makeEmbedding(0)): IAIBinding => ({
  run: vi.fn().mockResolvedValue({ data: [embedding] }),
});

const makeVectorize = (): IVectorizeIndex => ({
  upsert: vi.fn().mockResolvedValue({}),
  query: vi.fn().mockResolvedValue({ matches: [] }),
  deleteByIds: vi.fn().mockResolvedValue({}),
});

const makeDoc = (overrides: Partial<VectorDocument['metadata']> = {}): VectorDocument => ({
  text: 'Some chunk text',
  metadata: {
    repository_id: 'repo-123',
    type: 'doc',
    file_path: 'docs/guide.md',
    ...overrides,
  },
});

describe('VectorizeService', () => {
  describe('upsert()', () => {
    it('calls AI embed once per batch of 100', async () => {
      // Arrange
      const ai = { run: vi.fn().mockResolvedValue({ data: Array.from({ length: 150 }, () => makeEmbedding(0)) }) } as IAIBinding;
      const vectorize = makeVectorize();
      const service = new VectorizeService(vectorize, ai);
      const docs = Array.from({ length: 150 }, (_, i) => makeDoc({ file_path: `file-${i}.md` }));

      // Act
      await service.upsert(docs);

      // Assert — two embed calls: batch of 100, then batch of 50
      expect(ai.run).toHaveBeenCalledTimes(2);
      const [firstCall, secondCall] = (ai.run as ReturnType<typeof vi.fn>).mock.calls as [[string, { text: string[] }], [string, { text: string[] }]];
      expect(firstCall[1].text).toHaveLength(100);
      expect(secondCall[1].text).toHaveLength(50);
    });

    it('calls vectorize.upsert once per batch', async () => {
      // Arrange
      const fakeEmbeddings = Array.from({ length: 150 }, (_, i) => makeEmbedding(i));
      const ai: IAIBinding = {
        run: vi.fn()
          .mockResolvedValueOnce({ data: fakeEmbeddings.slice(0, 100) })
          .mockResolvedValueOnce({ data: fakeEmbeddings.slice(100) }),
      };
      const vectorize = makeVectorize();
      const service = new VectorizeService(vectorize, ai);
      const docs = Array.from({ length: 150 }, (_, i) => makeDoc({ file_path: `file-${i}.md` }));

      // Act
      await service.upsert(docs);

      // Assert
      expect(vectorize.upsert).toHaveBeenCalledTimes(2);
    });

    it('generates vector ID as encodeURIComponent(repo_id):encodeURIComponent(file_path):chunkIndex', async () => {
      // Arrange
      const ai: IAIBinding = { run: vi.fn().mockResolvedValue({ data: [makeEmbedding(0)] }) };
      const vectorize = makeVectorize();
      const service = new VectorizeService(vectorize, ai);
      const doc = makeDoc({ repository_id: 'my repo', file_path: 'src/main.ts' });

      // Act
      await service.upsert([doc]);

      // Assert
      const [vectors] = (vectorize.upsert as ReturnType<typeof vi.fn>).mock.calls[0] as [{ id: string }[]];
      expect(vectors[0]?.id).toBe(`${encodeURIComponent('my repo')}:${encodeURIComponent('src/main.ts')}:0`);
    });

    it('uses issue_number as path segment when file_path is absent', async () => {
      // Arrange
      const ai: IAIBinding = { run: vi.fn().mockResolvedValue({ data: [makeEmbedding(0)] }) };
      const vectorize = makeVectorize();
      const service = new VectorizeService(vectorize, ai);
      const doc: VectorDocument = {
        text: 'Issue body',
        metadata: { repository_id: 'repo-x', type: 'issue', issue_number: 42, issue_state: 'open', labels: ['bug'] },
      };

      // Act
      await service.upsert([doc]);

      // Assert
      const [vectors] = (vectorize.upsert as ReturnType<typeof vi.fn>).mock.calls[0] as [{ id: string }[]];
      expect(vectors[0]?.id).toContain(':42:');
    });

    it('stores doc.text as metadata.content', async () => {
      // Arrange
      const ai: IAIBinding = { run: vi.fn().mockResolvedValue({ data: [makeEmbedding(0)] }) };
      const vectorize = makeVectorize();
      const service = new VectorizeService(vectorize, ai);
      const doc = makeDoc();

      // Act
      await service.upsert([doc]);

      // Assert
      const [vectors] = (vectorize.upsert as ReturnType<typeof vi.fn>).mock.calls[0] as [{ metadata: Record<string, unknown> }[]];
      expect(vectors[0]?.metadata?.['content']).toBe('Some chunk text');
    });
  });

  describe('search()', () => {
    it('transforms query: lowercases and expands abbreviations', async () => {
      // Arrange
      const ai = makeAI();
      const vectorize = makeVectorize();
      const service = new VectorizeService(vectorize, ai);

      // Act
      await service.search('Auth Bug', { repository_id: 'repo-1' });

      // Assert — "auth" expands to "authentication authorization"
      const [, options] = (ai.run as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { text: string[] }];
      expect(options.text[0]).toBe('authentication authorization bug');
    });

    it('strips punctuation from query before expanding', async () => {
      // Arrange
      const ai = makeAI();
      const vectorize = makeVectorize();
      const service = new VectorizeService(vectorize, ai);

      // Act
      await service.search('auth: timeout!', { repository_id: 'repo-1' });

      // Assert — punctuation stripped, auth expanded
      const [, options] = (ai.run as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { text: string[] }];
      expect(options.text[0]).toBe('authentication authorization timeout');
    });

    it('builds Vectorize filter with repository_id', async () => {
      // Arrange
      const ai = makeAI();
      const vectorize = makeVectorize();
      const service = new VectorizeService(vectorize, ai);

      // Act
      await service.search('bug', { repository_id: 'repo-abc' });

      // Assert
      const [, queryOptions] = (vectorize.query as ReturnType<typeof vi.fn>).mock.calls[0] as [number[], { filter: Record<string, unknown> }];
      expect(queryOptions.filter).toMatchObject({ repository_id: { $eq: 'repo-abc' } });
    });

    it('includes type in filter when provided', async () => {
      // Arrange
      const ai = makeAI();
      const vectorize = makeVectorize();
      const service = new VectorizeService(vectorize, ai);

      // Act
      await service.search('login fail', { repository_id: 'repo-abc', type: 'issue' });

      // Assert
      const [, queryOptions] = (vectorize.query as ReturnType<typeof vi.fn>).mock.calls[0] as [number[], { filter: Record<string, unknown> }];
      expect(queryOptions.filter).toMatchObject({ type: { $eq: 'issue' } });
    });

    it('reconstructs VectorDocument from match metadata', async () => {
      // Arrange
      const match: IVectorizeMatch = {
        id: 'vec-1',
        score: 0.92,
        metadata: {
          content: 'The original chunk text',
          repository_id: 'repo-1',
          type: 'doc',
          file_path: 'README.md',
        },
      };
      const vectorize: IVectorizeIndex = {
        upsert: vi.fn(),
        query: vi.fn().mockResolvedValue({ matches: [match] }),
        deleteByIds: vi.fn(),
      };
      const ai = makeAI();
      const service = new VectorizeService(vectorize, ai);

      // Act
      const results = await service.search('readme', { repository_id: 'repo-1' });

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0]?.text).toBe('The original chunk text');
      expect(results[0]?.metadata.repository_id).toBe('repo-1');
      expect(results[0]?.metadata.file_path).toBe('README.md');
    });

    it('returns empty array when Vectorize returns no matches', async () => {
      // Arrange
      const ai = makeAI();
      const vectorize = makeVectorize(); // query returns { matches: [] }
      const service = new VectorizeService(vectorize, ai);

      // Act
      const results = await service.search('nothing', { repository_id: 'repo-1' });

      // Assert
      expect(results).toHaveLength(0);
    });
  });

  describe('delete()', () => {
    it('delegates to vectorize.deleteByIds', async () => {
      // Arrange
      const ai = makeAI();
      const vectorize = makeVectorize();
      const service = new VectorizeService(vectorize, ai);
      const ids = ['id-1', 'id-2', 'id-3'];

      // Act
      await service.delete(ids);

      // Assert
      expect(vectorize.deleteByIds).toHaveBeenCalledOnce();
      expect(vectorize.deleteByIds).toHaveBeenCalledWith(ids);
    });
  });
});
